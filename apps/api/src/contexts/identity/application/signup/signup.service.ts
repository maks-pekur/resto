import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { defaultLocaleForCountry, TenantSlug } from '@resto/domain';
import { AUTH_TOKEN } from '../../identity.tokens';
import type { Auth } from '../../infrastructure/better-auth/auth.config';
import { BA_USER_READER, type BaUserReader } from '../ports/ba-user-reader.port';
import {
  SESSION_ACTIVE_TENANT_ACTIVATOR,
  type SessionActiveTenantActivator,
} from '../ports/session-active-tenant-activator.port';
import { BootstrapOwnerService } from './bootstrap-owner.service';
import {
  OwnerAlreadyExistsError,
  BetterAuthBootstrapFailureError,
} from '../../domain/bootstrap-errors';
import {
  SlugUnavailableError,
  SignupEmailAlreadyExistsError,
  SignupBetterAuthFailureError,
} from '../../domain/signup-errors';
import type { SignUpInput } from '../dto';
import { TENANT_LOOKUP_PORT, type TenantLookupPort } from '../ports/tenant-lookup.port';
import {
  TENANT_PROVISIONING_PORT,
  type IdentityTenantView,
  type TenantProvisioningPort,
} from '../ports/tenant-provisioning.port';

// WR-06: total candidates is MAX_SLUG_CANDIDATES (base + base-2 .. base-100).
// There is no `base-1` — base IS the first candidate. Renamed from the
// off-by-one MAX_SLUG_SUFFIX label so future readers do not assume the
// constant is the suffix value.
export const MAX_SLUG_CANDIDATES = 100;
const SLUG_MAX_LEN = 30;

/**
 * D-06 (Phase 03): floor on total `executeOrTimeEqualize` duration. Both
 * branches (real signup vs. swallowed email-taken) pad to this floor so
 * response-time analysis cannot distinguish "this email is registered" from
 * "this email is new". 350ms covers the p95 of the happy path in dev
 * (provision tenant + signUpEmail scrypt + addMember + signInEmail scrypt);
 * happy-path runs longer than the floor are returned without padding.
 */
const PARITY_FLOOR_MS = 350;

export interface SignUpResult {
  readonly tenant: IdentityTenantView;
  readonly userId: string;
  readonly setCookie: readonly string[];
}

/**
 * D-06 enumeration-safe public response. The wrapped `executeOrTimeEqualize`
 * NEVER leaks tenant id, user id, or Set-Cookie — both branches collapse to
 * `{ status: 'pending_verification' }`. The caller must complete the email
 * verification + sign-in dance on the next request.
 */
export interface SignUpEqualizedResult {
  readonly status: 'pending_verification';
}

// Task 2 (finalize-tenant-setup.service.ts) reuses this pair rather than
// reimplementing slug derivation — D-30/UI-SPEC S4 require the SAME
// silent-collision behaviour at onboarding that signup already has here.
export const slugify = (raw: string): string => {
  const ascii = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (ascii.length === 0) return 'tenant';
  return ascii.slice(0, SLUG_MAX_LEN).replace(/-+$/g, '') || 'tenant';
};

export const findFreeSlug = async (lookup: TenantLookupPort, base: string): Promise<string> => {
  // WR-06 part 2 (DEFERRED): batch via `LIKE 'base%'` requires a new
  // TenantLookupPort method + repository impl + adapter wiring across
  // the identity → tenancy bounded-context boundary. Tracked for a
  // future ticket; current sequential lookup is acceptable for the
  // typical N=0..1 case on signup.
  for (let i = 0; i < MAX_SLUG_CANDIDATES; i++) {
    const candidate = i === 0 ? base : `${base}-${(i + 1).toString()}`;
    const existing = await lookup.findBySlug(candidate);
    if (!existing) return candidate;
  }
  throw new SlugUnavailableError(base);
};

@Injectable()
export class SignUpService {
  private readonly logger = new Logger(SignUpService.name);

  constructor(
    @Inject(TENANT_PROVISIONING_PORT) private readonly tenantProvisioning: TenantProvisioningPort,
    @Inject(BootstrapOwnerService) private readonly bootstrap: BootstrapOwnerService,
    @Inject(TENANT_LOOKUP_PORT) private readonly tenantLookup: TenantLookupPort,
    @Inject(AUTH_TOKEN) private readonly auth: Auth,
    @Inject(BA_USER_READER) private readonly users: BaUserReader,
    @Inject(SESSION_ACTIVE_TENANT_ACTIVATOR)
    private readonly tenantActivator: SessionActiveTenantActivator,
  ) {}

  /**
   * D-06 enumeration-parity wrapper. The HTTP controller MUST call this
   * method (not `execute`) so neither response body nor response time
   * distinguishes "email is taken" from "email is new".
   *
   * Behavior:
   *   1. Run the real `execute(input)`; on success the cookies / tenantId
   *      / userId from the success branch are intentionally DROPPED — both
   *      branches collapse to `{ status: 'pending_verification' }`. The new
   *      user follows the email-verification + explicit-sign-in dance on
   *      subsequent requests; pre-D-06 the controller auto-signed-in via
   *      the returned cookies, which was the timing leak.
   *   2. On `SignupEmailAlreadyExistsError`, swallow it. Other errors
   *      (slug exhaustion, BA failure, validation) propagate — those are
   *      observable to a legitimate caller and don't leak email existence.
   *   3. Always pad the total method duration to `PARITY_FLOOR_MS` so the
   *      fast "email exists" probe path cannot be distinguished by timing.
   */
  async executeOrTimeEqualize(input: SignUpInput): Promise<SignUpEqualizedResult> {
    const t0 = Date.now();
    try {
      await this.execute(input);
    } catch (err) {
      if (!(err instanceof SignupEmailAlreadyExistsError)) {
        throw err;
      }
      this.logger.log(
        { email: this.redactEmail(input.email) },
        'signup.email_taken swallowed for enumeration parity (D-06).',
      );
    }
    const elapsed = Date.now() - t0;
    if (elapsed < PARITY_FLOOR_MS) {
      await new Promise<void>((resolve) => setTimeout(resolve, PARITY_FLOOR_MS - elapsed));
    }
    return { status: 'pending_verification' };
  }

  /**
   * Domain-side log redaction: keep `<first>***@<host>` so support can match
   * a complaint without the structured log itself leaking the full address.
   */
  private redactEmail(email: string): string {
    const at = email.indexOf('@');
    if (at <= 1) return '***';
    const host = email.slice(at);
    return `${email[0] ?? '*'}***${host}`;
  }

  async execute(input: SignUpInput): Promise<SignUpResult> {
    if (await this.userExistsByEmail(input.email)) {
      throw new SignupEmailAlreadyExistsError(input.email);
    }
    // D-27: the person's name never becomes the tenant's name. The
    // provisional slug/displayName are derived from it plus a random
    // suffix (so two "Roma" signups never collide) purely as a scratch
    // identifier — onboarding replaces both before the owner sees a
    // dashboard. `findFreeSlug` is still the final guard against the
    // astronomically unlikely random-suffix collision.
    const provisionalBase = `${slugify(input.name)}-${randomUUID().slice(0, 6)}`;
    const provisionalSlug = await findFreeSlug(this.tenantLookup, provisionalBase);

    const tenant = await this.tenantProvisioning.provision({
      slug: TenantSlug.parse(provisionalSlug),
      displayName: provisionalSlug,
      country: input.country,
      locale: defaultLocaleForCountry(input.country),
      status: 'pending_setup',
    });

    try {
      await this.bootstrap.execute({
        tenantSlug: tenant.slug,
        email: input.email,
        password: input.password,
        name: input.name,
      });
    } catch (err) {
      if (err instanceof OwnerAlreadyExistsError) {
        throw new SignupEmailAlreadyExistsError(input.email);
      }
      if (err instanceof BetterAuthBootstrapFailureError) {
        // CR-02: avoid regex-matching BA's error message — `^email.*already`
        // is not part of BA's API contract and silently breaks on upgrades,
        // re-opening the D-06 enumeration channel. Re-probe the BA user
        // store instead so we ground the email-taken branch in DB state.
        if (await this.userExistsByEmail(input.email)) {
          throw new SignupEmailAlreadyExistsError(input.email);
        }
        const stage: 'signUpEmail' | 'addMember' = /addMember/i.test(err.message)
          ? 'addMember'
          : 'signUpEmail';
        throw new SignupBetterAuthFailureError(stage, err);
      }
      throw err;
    }

    const session = await this.signInAndActivate(input.email, input.password, tenant.id);
    return { tenant, userId: session.userId, setCookie: session.setCookie };
  }

  private async userExistsByEmail(email: string): Promise<boolean> {
    return (await this.users.findUserByEmail(email)) !== null;
  }

  private async signInAndActivate(
    email: string,
    password: string,
    tenantId: string,
  ): Promise<{ userId: string; setCookie: readonly string[] }> {
    let signInHeaders: Headers;
    let userId: string;
    try {
      const result = await this.auth.api.signInEmail({
        body: { email, password },
        returnHeaders: true,
      });
      signInHeaders = (result as { headers: Headers }).headers;
      const r = result as {
        response?: { user?: { id: string } };
        user?: { id: string };
      };
      userId = r.response?.user?.id ?? r.user?.id ?? '';
    } catch (err) {
      throw new SignupBetterAuthFailureError('signInEmail', err);
    }

    const cookieHeader = this.cookieHeaderFromSetCookie(this.collectSetCookies(signInHeaders));

    try {
      const result = await this.tenantActivator.activateTenant({ tenantId, cookieHeader });
      const setActiveCookies = this.collectSetCookies(result.headers);
      const merged =
        setActiveCookies.length > 0 ? setActiveCookies : this.collectSetCookies(signInHeaders);
      return { userId, setCookie: merged };
    } catch (err) {
      this.logger.warn(
        { tenantId, err: err instanceof Error ? err.message : String(err) },
        'set-active-tenant failed; falling back to sign-in cookies (user will need to set-active manually).',
      );
      return { userId, setCookie: this.collectSetCookies(signInHeaders) };
    }
  }

  private collectSetCookies(headers: Headers): readonly string[] {
    const getter = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    if (typeof getter === 'function') return getter.call(headers);
    const single = headers.get('set-cookie');
    return single ? [single] : [];
  }

  private cookieHeaderFromSetCookie(setCookies: readonly string[]): string {
    return setCookies
      .map((sc) => sc.split(';')[0] ?? '')
      .filter((s) => s.length > 0)
      .join('; ');
  }
}
