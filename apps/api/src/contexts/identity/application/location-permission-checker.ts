import { Inject, Injectable } from '@nestjs/common';
import type { Permission } from '@resto/domain';
import { AUTH_DRIZZLE_TOKEN } from '../identity.tokens';
import type { AuthDrizzle } from '../infrastructure/better-auth/auth-db';
import type { OperatorPrincipal } from '../domain/principal';
import type { PermissionChecker } from './ports/permission-checker.port';
import {
  MEMBER_LOCATION_SCOPE_READER,
  type MemberLocationScopeReader,
} from './ports/member-location-scope-reader.port';
import { computeEffectivePermissions, isSubsetOf } from './effective-permissions';
import { listActiveCustomRoles } from './list-active-custom-roles';

// D-08 / Pitfall 2 (RESEARCH): a non-owner's effective permissions come
// from member_location_scope.role at activeLocationId, never BA's
// tenant-wide hasPermission (it has zero location concept).
@Injectable()
export class LocationPermissionChecker implements PermissionChecker {
  constructor(
    @Inject(MEMBER_LOCATION_SCOPE_READER) private readonly reader: MemberLocationScopeReader,
    @Inject(AUTH_DRIZZLE_TOKEN) private readonly authDb: AuthDrizzle,
  ) {}

  async hasPermission(
    principal: OperatorPrincipal,
    required: Permission,
    _headers?: Headers,
    activeLocationId?: string | null,
  ): Promise<boolean> {
    if (principal.baseRole === 'owner') return true;
    if (!activeLocationId || !principal.tenantId) return false;

    const roleSlug = await this.reader.findRoleForMemberAtLocation({
      userId: principal.userId,
      locationId: activeLocationId,
    });
    if (!roleSlug) return false;

    const activeRoles = await listActiveCustomRoles(this.authDb, principal.tenantId);
    const customRoleLookup = (slug: string): Record<string, string[]> | null =>
      activeRoles.find((r) => r.role === slug)?.permission ?? null;

    const effective = computeEffectivePermissions(roleSlug, customRoleLookup);
    return isSubsetOf(required as Record<string, string[]>, effective);
  }
}
