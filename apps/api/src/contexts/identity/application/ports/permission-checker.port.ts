import type { Permission } from '@resto/domain';
import type { OperatorPrincipal } from '../../domain/principal';

/**
 * Resolves whether an operator principal has the requested permission
 * subset. Implementation backed by Better Auth (organization plugin)
 * lives in infrastructure/better-auth/permission-checker.adapter.ts.
 *
 * Customers do NOT have RBAC permissions in Phase B; the
 * PermissionsGuard rejects customer principals before reaching this
 * port.
 *
 * `headers` carries the BA session cookie / Bearer token built from the
 * Fastify request headers. The adapter needs them to resolve the active
 * session; passing `undefined` is treated as "deny" (no session).
 *
 * `activeLocationId` comes from the session row via `AuthGuard`. D-06 puts a
 * non-owner's role on `member_location_scope`, so without it a location-aware
 * implementation can only deny. It is declared here rather than only on the
 * implementation because an extra parameter on the class is invisible to every
 * caller — which is exactly how it stayed unwired (08.4-07).
 */
export interface PermissionChecker {
  hasPermission(
    principal: OperatorPrincipal,
    required: Permission,
    headers?: Headers,
    activeLocationId?: string | null,
  ): Promise<boolean>;
}

export const PERMISSION_CHECKER = Symbol('PermissionChecker');
