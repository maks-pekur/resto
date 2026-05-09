import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { user as userTable } from '@resto/db/schema';
import { ProvisionTenantService } from '../../tenancy/application/provision-tenant.service';
import { TENANT_REPOSITORY, type TenantRepository } from '../../tenancy/domain/ports';
import type { TenantSnapshot } from '../../tenancy/domain/tenant.aggregate';
import { TenantSlug } from '@resto/domain';
import { AUTH_DRIZZLE_TOKEN, AUTH_TOKEN } from '../identity.tokens';
import type { Auth } from '../infrastructure/better-auth/auth.config';
import type { AuthDrizzle } from '../infrastructure/better-auth/auth-db';
import { BootstrapOwnerService } from './bootstrap-owner.service';
import {
  OwnerAlreadyExistsError,
  BetterAuthBootstrapFailureError,
} from '../domain/bootstrap-errors';
import {
  SlugUnavailableError,
  SignupEmailAlreadyExistsError,
  SignupBetterAuthFailureError,
} from '../domain/signup-errors';
import type { SignUpInput } from './dto';

const MAX_SLUG_SUFFIX = 99;
const SLUG_MAX_LEN = 30;

export interface SignUpResult {
  readonly tenant: TenantSnapshot;
  readonly userId: string;
  readonly setCookie: readonly string[];
}

const slugify = (raw: string): string => {
  const ascii = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (ascii.length === 0) return 'tenant';
  return ascii.slice(0, SLUG_MAX_LEN).replace(/-+$/g, '') || 'tenant';
};

@Injectable()
export class SignUpService {
  private readonly logger = new Logger(SignUpService.name);

  constructor(
    @Inject(ProvisionTenantService) private readonly provision: ProvisionTenantService,
    @Inject(BootstrapOwnerService) private readonly bootstrap: BootstrapOwnerService,
    @Inject(TENANT_REPOSITORY) private readonly tenants: TenantRepository,
    @Inject(AUTH_TOKEN) private readonly auth: Auth,
    @Inject(AUTH_DRIZZLE_TOKEN) private readonly authDb: AuthDrizzle,
  ) {}

  async execute(input: SignUpInput): Promise<SignUpResult> {
    if (await this.userExistsByEmail(input.email)) {
      throw new SignupEmailAlreadyExistsError(input.email);
    }
    const base = slugify(input.displayName);
    const slug = await this.findFreeSlug(base);

    const tenant = await this.provision.execute({
      slug: TenantSlug.parse(slug),
      displayName: input.displayName,
      locale: input.locale,
      defaultCurrency: input.defaultCurrency,
    });

    try {
      await this.bootstrap.execute({
        tenantSlug: tenant.slug,
        email: input.email,
        password: input.password,
        name: input.displayName,
      });
    } catch (err) {
      if (err instanceof OwnerAlreadyExistsError) {
        throw new SignupEmailAlreadyExistsError(input.email);
      }
      if (err instanceof BetterAuthBootstrapFailureError) {
        const message = err.message;
        if (/email/i.test(message) && /already/i.test(message)) {
          throw new SignupEmailAlreadyExistsError(input.email);
        }
        const stage: 'signUpEmail' | 'addMember' = message.includes('addMember')
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
    const rows = await this.authDb.db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1);
    return rows.length > 0;
  }

  private async findFreeSlug(base: string): Promise<string> {
    for (let suffix = 0; suffix <= MAX_SLUG_SUFFIX; suffix++) {
      const candidate = suffix === 0 ? base : `${base}-${(suffix + 1).toString()}`;
      const existing = await this.tenants.findBySlug(TenantSlug.parse(candidate));
      if (!existing) return candidate;
    }
    throw new SlugUnavailableError(base);
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
      const result = await (
        this.auth.api as unknown as {
          setActiveOrganization: (args: {
            body: { organizationId: string };
            headers: Record<string, string>;
            returnHeaders: true;
          }) => Promise<{ headers: Headers }>;
        }
      ).setActiveOrganization({
        body: { organizationId: tenantId },
        headers: { cookie: cookieHeader },
        returnHeaders: true,
      });
      const setActiveCookies = this.collectSetCookies(result.headers);
      const merged =
        setActiveCookies.length > 0 ? setActiveCookies : this.collectSetCookies(signInHeaders);
      return { userId, setCookie: merged };
    } catch (err) {
      this.logger.warn(
        { tenantId, email, err: err instanceof Error ? err.message : String(err) },
        'set-active-organization failed; falling back to sign-in cookies (user will need to set-active manually).',
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
