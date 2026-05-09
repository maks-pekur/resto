import { Inject, Injectable, Logger } from '@nestjs/common';
import { ProvisionTenantService } from '../../tenancy/application/provision-tenant.service';
import { TENANT_REPOSITORY, type TenantRepository } from '../../tenancy/domain/ports';
import type { TenantSnapshot } from '../../tenancy/domain/tenant.aggregate';
import { TenantSlug } from '@resto/domain';
import { AUTH_TOKEN } from '../identity.tokens';
import type { Auth } from '../infrastructure/better-auth/auth.config';
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
  ) {}

  async execute(input: SignUpInput): Promise<SignUpResult> {
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
        const stage: 'signUpEmail' | 'addMember' = /addMember/.test(message)
          ? 'addMember'
          : 'signUpEmail';
        throw new SignupBetterAuthFailureError(stage, err);
      }
      throw err;
    }

    const session = await this.signInAndCaptureCookies(input.email, input.password);
    if (session.tenantId !== tenant.id) {
      this.logger.warn(
        { tenantId: tenant.id, sessionTenantId: session.tenantId, email: input.email },
        'Signup completed but BA session did not auto-bind to the new tenant.',
      );
    }

    return { tenant, userId: session.userId, setCookie: session.setCookie };
  }

  private async findFreeSlug(base: string): Promise<string> {
    for (let suffix = 0; suffix <= MAX_SLUG_SUFFIX; suffix++) {
      const candidate = suffix === 0 ? base : `${base}-${(suffix + 1).toString()}`;
      const existing = await this.tenants.findBySlug(TenantSlug.parse(candidate));
      if (!existing) return candidate;
    }
    throw new SlugUnavailableError(base);
  }

  private async signInAndCaptureCookies(
    email: string,
    password: string,
  ): Promise<{ userId: string; tenantId: string | null; setCookie: readonly string[] }> {
    try {
      const result = await this.auth.api.signInEmail({
        body: { email, password },
        returnHeaders: true,
      });
      const headers = (result as { headers?: Headers }).headers;
      const cookies = headers ? this.collectSetCookies(headers) : [];
      const r = result as {
        response?: { user?: { id: string; activeOrganizationId?: string } };
        user?: { id: string };
      };
      const userId = r.response?.user?.id ?? r.user?.id ?? '';
      const tenantId = r.response?.user?.activeOrganizationId ?? null;
      return { userId, tenantId, setCookie: cookies };
    } catch (err) {
      throw new SignupBetterAuthFailureError('signInEmail', err);
    }
  }

  private collectSetCookies(headers: Headers): readonly string[] {
    const getter = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    if (typeof getter === 'function') return getter.call(headers);
    const single = headers.get('set-cookie');
    return single ? [single] : [];
  }
}
