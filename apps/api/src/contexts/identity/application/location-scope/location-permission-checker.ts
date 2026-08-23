import { Inject, Injectable } from '@nestjs/common';
import type { Permission } from '@resto/domain';
import { AUTH_DRIZZLE_TOKEN } from '../../identity.tokens';
import type { AuthDrizzle } from '../../infrastructure/better-auth/auth-db';
import type { OperatorPrincipal } from '../../domain/principal';
import type { PermissionChecker } from '../ports/permission-checker.port';
import {
  MEMBER_LOCATION_SCOPE_READER,
  type MemberLocationScopeReader,
} from '../ports/member-location-scope-reader.port';
import { computeEffectivePermissions, isSubsetOf } from '@resto/domain';
import { listActiveCustomRoles } from '../roles/list-active-custom-roles';

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
    if (!principal.tenantId) return false;

    // Union of the tenant-level system role and the role held at the active location. Both are
    // real: `staff` carries the tenant-wide baseline (tenant:read, location:read) that bootstraps
    // a session, and `member_location_scope.role` adds what the member may do *there* (D-06).
    //
    // Location-only would deadlock. Picking a location goes through
    // `POST /v1/me/set-active-location`, which is itself gated on `tenant: ['read']` — so a member
    // with no location yet could never acquire one.
    const locationRole = activeLocationId
      ? await this.reader.findRoleForMemberAtLocation({
          userId: principal.userId,
          locationId: activeLocationId,
        })
      : null;

    const roleCsv = [principal.baseRole, locationRole].filter(Boolean).join(',');
    if (!roleCsv) return false;

    const activeRoles = await listActiveCustomRoles(this.authDb, principal.tenantId);
    const customRoleLookup = (slug: string): Record<string, string[]> | null =>
      activeRoles.find((r) => r.role === slug)?.permission ?? null;

    const effective = computeEffectivePermissions(roleCsv, customRoleLookup);
    return isSubsetOf(required as Record<string, string[]>, effective);
  }
}
