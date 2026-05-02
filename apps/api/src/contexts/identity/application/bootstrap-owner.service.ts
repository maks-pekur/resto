import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { AUTH_TOKEN } from '../identity.tokens';
import type { Auth } from '../infrastructure/better-auth/auth.config';
import { TENANT_LOOKUP_PORT, type TenantLookupPort } from './ports/tenant-lookup.port';
import {
  BetterAuthBootstrapFailureError,
  TenantNotFoundForBootstrapError,
} from '../domain/bootstrap-errors';

export interface BootstrapOwnerInput {
  readonly tenantSlug: string;
  readonly email: string;
  readonly password: string;
  readonly name: string;
}

export interface BootstrapOwnerResult {
  readonly tenantId: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly email: string;
  readonly requiresPasswordChange: boolean;
}

const EmailSchema = z.string().trim().toLowerCase().email();

/**
 * Bootstraps the very first owner for a tenant via Better Auth's admin
 * API. Happy path only — idempotency probes (existing owner / existing
 * org / existing user) are added in Task 10.
 *
 * BA admin API surface used (verified against better-auth 1.3.34 .d.ts):
 *   - `auth.api.signUpEmail` — creates the user and credential
 *   - `auth.api.createOrganization` — creates the org row (BA's
 *     `organization` is mapped onto our `tenants` table — see ADR-0013)
 *   - `auth.api.addMember` — SERVER_ONLY; attaches the user with role=owner
 *
 * The service must NOT touch infrastructure directly: it talks to BA via
 * the AUTH_TOKEN provider and to tenancy via TenantLookupPort.
 */
@Injectable()
export class BootstrapOwnerService {
  private readonly logger = new Logger(BootstrapOwnerService.name);

  constructor(
    @Inject(TENANT_LOOKUP_PORT) private readonly tenants: TenantLookupPort,
    @Inject(AUTH_TOKEN) private readonly auth: Auth,
  ) {}

  async execute(input: BootstrapOwnerInput): Promise<BootstrapOwnerResult> {
    const email = EmailSchema.parse(input.email);
    const tenant = await this.tenants.findBySlug(input.tenantSlug);
    if (!tenant) throw new TenantNotFoundForBootstrapError(input.tenantSlug);

    this.logger.log({
      event: 'identity.owner_bootstrap.start',
      tenantId: tenant.id,
      email,
    });

    const userId = await this.ensureUser(email, input.password, input.name);
    const organizationId = await this.ensureOrganization(tenant.slug, tenant.displayName);
    await this.addOwnerMember(userId, organizationId);

    this.logger.log({
      event: 'identity.owner_bootstrap.done',
      tenantId: tenant.id,
      userId,
      email,
    });

    return {
      tenantId: tenant.id,
      userId,
      organizationId,
      email,
      requiresPasswordChange: true,
    };
  }

  private async ensureUser(email: string, password: string, name: string): Promise<string> {
    try {
      const result = await this.auth.api.signUpEmail({
        body: { email, password, name },
      });
      const user = (result as { user: { id: string } }).user;
      this.logger.log({
        event: 'identity.owner_bootstrap.user_created',
        userId: user.id,
        email,
      });
      return user.id;
    } catch (err) {
      throw new BetterAuthBootstrapFailureError('signUpEmail', err);
    }
  }

  private async ensureOrganization(slug: string, displayName: string): Promise<string> {
    try {
      const result = await orgApi(this.auth).createOrganization({
        body: { name: displayName, slug },
      });
      // BA returns the freshly created org; the `organization` table is
      // physically `tenants`, so this id matches the tenant id when no
      // pre-existing row would conflict (idempotency in Task 10).
      const orgId = result?.id;
      if (!orgId) {
        throw new Error('createOrganization returned no id');
      }
      this.logger.log({
        event: 'identity.owner_bootstrap.org_created',
        organizationId: orgId,
      });
      return orgId;
    } catch (err) {
      throw new BetterAuthBootstrapFailureError('createOrganization', err);
    }
  }

  private async addOwnerMember(userId: string, organizationId: string): Promise<void> {
    try {
      await orgApi(this.auth).addMember({
        body: { userId, organizationId, role: 'owner' },
      });
      this.logger.log({
        event: 'identity.owner_bootstrap.member_added',
        userId,
        organizationId,
      });
    } catch (err) {
      throw new BetterAuthBootstrapFailureError('addMember', err);
    }
  }
}

/**
 * Local typing bridge for the BA organization plugin endpoints.
 *
 * `auth.config.ts` casts the `organization()` plugin to `BetterAuthPlugin`
 * to work around a known typing gap in BA 1.3.x (the plugin's concrete
 * endpoint overloads don't satisfy the index signature on
 * `BetterAuthPlugin`). That cast erases the plugin endpoints from
 * `Auth['api']`'s inferred type. The runtime endpoints are still there —
 * we just need a typed handle to call them.
 *
 * Kept module-scoped so the service body stays clean of `as` casts.
 */
interface OrgPluginApi {
  createOrganization: (args: {
    body: { name: string; slug: string };
  }) => Promise<{ id: string; slug: string; name: string } | null>;
  addMember: (args: {
    body: { userId: string; organizationId: string; role: string };
  }) => Promise<{ id: string; userId: string; role: string }>;
}

const orgApi = (auth: Auth): OrgPluginApi => auth.api as unknown as OrgPluginApi;
