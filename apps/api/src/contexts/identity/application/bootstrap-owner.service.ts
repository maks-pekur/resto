import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { user as userTable } from '@resto/db/schema';
import { AUTH_DRIZZLE_TOKEN, AUTH_TOKEN } from '../identity.tokens';
import type { Auth } from '../infrastructure/better-auth/auth.config';
import type { AuthDrizzle } from '../infrastructure/better-auth/auth-db';
import { TENANT_LOOKUP_PORT, type TenantLookupPort } from './ports/tenant-lookup.port';
import {
  BetterAuthBootstrapFailureError,
  OwnerAlreadyExistsError,
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
 * API. Idempotent: re-running with the same `(tenantSlug, email)` is a
 * no-op; re-running with a different email when an owner already exists
 * fails with `OwnerAlreadyExistsError`.
 *
 * BA admin API surface used (verified against better-auth 1.3.34 .d.ts):
 *   - `auth.api.listMembers` — GET, query=`{ organizationId }`, returns
 *     `{ members: [{ user: { id, email, ... }, role, ... }], total }`.
 *     Used as the existing-owner probe.
 *   - `auth.api.signUpEmail` — creates the user and credential.
 *   - `auth.api.addMember` — SERVER_ONLY; attaches the user with role=owner.
 *
 * BA's `organization` is physically aliased onto our `tenants` table (see
 * `packages/db/src/schema/auth.ts` + ADR-0013). The tenant row is created
 * by the provisioning flow and IS the BA organization — so this service
 * MUST NOT call `createOrganization` (it would either collide on the
 * `slug` unique constraint or insert a duplicate tenants row with a
 * different UUID, breaking the `organizationId === tenantId` invariant).
 * The organization id is read from `TenantLookupPort` and reused here.
 *
 * Existing-user probe is a direct Drizzle query against the BA `user`
 * table because BA core does not expose a `getUserByEmail` API (the
 * `admin` plugin offers one but we don't load it). The query runs through
 * `AUTH_DRIZZLE_TOKEN` (BYPASSRLS, BA-only), not the tenant-aware pool.
 *
 * The service must NOT touch infrastructure directly: it talks to BA via
 * the AUTH_TOKEN provider, to tenancy via TenantLookupPort, and to the BA
 * Drizzle pool via AUTH_DRIZZLE_TOKEN.
 */
@Injectable()
export class BootstrapOwnerService {
  private readonly logger = new Logger(BootstrapOwnerService.name);

  constructor(
    @Inject(TENANT_LOOKUP_PORT) private readonly tenants: TenantLookupPort,
    @Inject(AUTH_TOKEN) private readonly auth: Auth,
    @Inject(AUTH_DRIZZLE_TOKEN) private readonly authDb: AuthDrizzle,
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

    // Idempotency probe #1: does this org already have an owner?
    const existingOwner = await this.findExistingOwner(tenant.id);
    if (existingOwner) {
      if (existingOwner.email.toLowerCase() === email) {
        this.logger.log({
          event: 'identity.owner_bootstrap.noop',
          tenantId: tenant.id,
          userId: existingOwner.id,
          email,
        });
        return {
          tenantId: tenant.id,
          userId: existingOwner.id,
          organizationId: tenant.id,
          email,
          // Re-run is a no-op: we do not mutate the user, so we cannot
          // assert anything about their pending password-change state.
          // The CLI uses this flag only on first bootstrap; on a no-op
          // re-run there is nothing to print.
          requiresPasswordChange: false,
        };
      }
      throw new OwnerAlreadyExistsError(tenant.id, existingOwner.email);
    }

    // Idempotency probe #2: does the BA user already exist (e.g. previous
    // run created the user but failed before addMember)?
    const existingUser = await this.findUserByEmail(email);
    const userId = existingUser
      ? existingUser.id
      : await this.signUpUser(email, input.password, input.name);

    await this.addOwnerMember(userId, tenant.id);

    this.logger.log({
      event: 'identity.owner_bootstrap.done',
      tenantId: tenant.id,
      userId,
      email,
      reusedUser: existingUser !== null,
    });

    return {
      tenantId: tenant.id,
      userId,
      organizationId: tenant.id,
      email,
      requiresPasswordChange: true,
    };
  }

  private async findExistingOwner(
    organizationId: string,
  ): Promise<{ id: string; email: string } | null> {
    let result;
    try {
      result = await orgApi(this.auth).listMembers({
        query: { organizationId },
      });
    } catch (err) {
      throw new BetterAuthBootstrapFailureError('listMembers', err);
    }
    const owner = result.members.find((m) => m.role === 'owner');
    return owner ? { id: owner.user.id, email: owner.user.email } : null;
  }

  private async findUserByEmail(email: string): Promise<{ id: string; email: string } | null> {
    const rows = await this.authDb.db
      .select({ id: userTable.id, email: userTable.email })
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1);
    return rows[0] ?? null;
  }

  private async signUpUser(email: string, password: string, name: string): Promise<string> {
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
  addMember: (args: {
    body: { userId: string; organizationId: string; role: string };
  }) => Promise<{ id: string; userId: string; role: string }>;
  listMembers: (args: { query: { organizationId: string } }) => Promise<{
    members: readonly {
      id: string;
      role: string;
      user: { id: string; email: string };
    }[];
    total: number;
  }>;
}

const orgApi = (auth: Auth): OrgPluginApi => auth.api as unknown as OrgPluginApi;
