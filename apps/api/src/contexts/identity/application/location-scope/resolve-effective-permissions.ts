import { computeEffectivePermissions } from '@resto/domain';
import type { AuthDrizzle } from '../../infrastructure/better-auth/auth-db';
import type { MemberLocationScopeReader } from '../ports/member-location-scope-reader.port';
import { listActiveCustomRoles } from '../roles/list-active-custom-roles';

export interface ResolveEffectivePermissionsInput {
  readonly userId: string;
  readonly tenantId: string;
  readonly baseRole: string | undefined;
  readonly activeLocationId: string | null | undefined;
}

/**
 * The one place a non-owner's effective permissions are computed.
 *
 * It exists because there used to be two. `PermissionsGuard` unioned the tenant role with the role
 * held at the active location, while `/v1/me` computed from the tenant role alone — so the server
 * permitted actions it told the client were forbidden, and any navigation built on that response
 * would have hidden working screens. Both now call this.
 *
 * The union itself: `staff` carries the tenant-wide baseline that bootstraps a session (without it
 * `POST /v1/me/set-active-location`, gated on `tenant: read`, could never be reached), and
 * `member_location_scope.role` adds what the member may do *there* (D-06).
 */
export const resolveEffectivePermissions = async (
  authDb: AuthDrizzle,
  scopeReader: MemberLocationScopeReader,
  input: ResolveEffectivePermissionsInput,
): Promise<Record<string, string[]>> => {
  const locationRole = input.activeLocationId
    ? await scopeReader.findRoleForMemberAtLocation({
        userId: input.userId,
        locationId: input.activeLocationId,
      })
    : null;

  const roleCsv = [input.baseRole, locationRole].filter(Boolean).join(',');
  if (roleCsv === '') return {};

  const activeRoles = await listActiveCustomRoles(authDb, input.tenantId);
  const customRoleLookup = (slug: string): Record<string, string[]> | null =>
    activeRoles.find((role) => role.role === slug)?.permission ?? null;

  const effective = computeEffectivePermissions(roleCsv, customRoleLookup);
  const result: Record<string, string[]> = {};
  for (const [resource, actions] of Object.entries(effective)) {
    result[resource] = [...actions];
  }
  return result;
};
