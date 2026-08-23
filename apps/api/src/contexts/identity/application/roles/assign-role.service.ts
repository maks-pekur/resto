import { Inject, Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { containsNonDelegatable } from '@resto/domain';
import { member as memberTable } from '@resto/db/schema';
import { AUTH_TOKEN, AUTH_DRIZZLE_TOKEN } from '../../identity.tokens';
import type { Auth } from '../../infrastructure/better-auth/auth.config';
import type { AuthDrizzle } from '../../infrastructure/better-auth/auth-db';
import { roleApi } from '../../infrastructure/better-auth/role-api.bridge';
import {
  InsufficientPermissionsToMintError,
  RoleNotFoundError,
  SelfRoleAssignmentError,
  AssignmentExceedsAuthorityError,
} from '../../domain/errors';
import { computeEffectivePermissions, isSubsetOf } from '@resto/domain';
import { listActiveCustomRoles } from './list-active-custom-roles';

const SYSTEM_ROLE_SLUGS = new Set(['owner', 'admin', 'staff']);

export interface AssignRoleServiceInput {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly targetMemberId: string;
  readonly roleSlug: string;
  readonly headers: Headers;
}

@Injectable()
export class AssignRoleService {
  constructor(
    @Inject(AUTH_TOKEN) private readonly auth: Auth,
    @Inject(AUTH_DRIZZLE_TOKEN) private readonly authDb: AuthDrizzle,
  ) {}

  async execute(input: AssignRoleServiceInput): Promise<void> {
    if (SYSTEM_ROLE_SLUGS.has(input.roleSlug)) {
      throw new RoleNotFoundError(input.roleSlug);
    }

    const actorMemberRows = await this.authDb.db
      .select({ id: memberTable.id, role: memberTable.role })
      .from(memberTable)
      .where(
        and(eq(memberTable.userId, input.actorUserId), eq(memberTable.tenantId, input.tenantId)),
      )
      .limit(1);

    const actorMember = actorMemberRows[0];
    if (!actorMember) {
      throw new RoleNotFoundError(input.roleSlug);
    }

    if (actorMember.id === input.targetMemberId) {
      throw new SelfRoleAssignmentError();
    }

    const activeRoles = await listActiveCustomRoles(this.authDb, input.tenantId);

    const targetRole = activeRoles.find((r) => r.role === input.roleSlug);

    if (!targetRole) {
      throw new RoleNotFoundError(input.roleSlug);
    }

    const targetPerms = targetRole.permission;

    if (containsNonDelegatable(targetPerms)) {
      throw new InsufficientPermissionsToMintError();
    }

    const customRoleLookup = (slug: string): Record<string, string[]> | null => {
      const found = activeRoles.find((r) => r.role === slug);
      return found?.permission ?? null;
    };

    const actorEffective = computeEffectivePermissions(actorMember.role, customRoleLookup);

    if (!isSubsetOf(targetPerms, actorEffective)) {
      throw new AssignmentExceedsAuthorityError();
    }

    await roleApi(this.auth).updateMemberRole({
      body: {
        memberId: input.targetMemberId,
        role: input.roleSlug,
        organizationId: input.tenantId,
      },
      headers: input.headers,
    });
  }
}
