import { Inject, Injectable } from '@nestjs/common';
import { schema, TenantAwareDb } from '@resto/db';
import { containsNonDelegatable } from '@resto/domain';
import { AUTH_DRIZZLE_TOKEN } from '../identity.tokens';
import type { AuthDrizzle } from '../infrastructure/better-auth/auth-db';
import { InsufficientPermissionsToMintError, RoleNotFoundError } from '../domain/errors';
import { listActiveCustomRoles } from './list-active-custom-roles';

const SYSTEM_ROLE_SLUGS = new Set(['owner', 'admin', 'staff']);

export interface AssignLocationRoleServiceInput {
  readonly organizationId: string;
  readonly memberId: string;
  readonly locationId: string;
  readonly roleSlug: string | null;
}

// D-06: unlike AssignRoleService, this ACCEPTS system-role slugs and
// upserts member_location_scope directly — never BA's role-mutation API.
@Injectable()
export class AssignLocationRoleService {
  constructor(
    @Inject(AUTH_DRIZZLE_TOKEN) private readonly authDb: AuthDrizzle,
    @Inject(TenantAwareDb) private readonly db: TenantAwareDb,
  ) {}

  async execute(input: AssignLocationRoleServiceInput): Promise<void> {
    if (input.roleSlug !== null && !SYSTEM_ROLE_SLUGS.has(input.roleSlug)) {
      const activeRoles = await listActiveCustomRoles(this.authDb, input.organizationId);
      const targetRole = activeRoles.find((r) => r.role === input.roleSlug);
      if (!targetRole) {
        throw new RoleNotFoundError(input.roleSlug);
      }
      if (containsNonDelegatable(targetRole.permission)) {
        throw new InsufficientPermissionsToMintError();
      }
    }

    await this.db.withTenant(async (_tx, scoped) => {
      await scoped
        .insertInto(schema.memberLocationScope, {
          memberId: input.memberId,
          locationId: input.locationId,
          role: input.roleSlug,
        })
        .onConflictDoUpdate({
          target: [schema.memberLocationScope.memberId, schema.memberLocationScope.locationId],
          set: { role: input.roleSlug, updatedAt: new Date() },
        });
    });
  }
}
