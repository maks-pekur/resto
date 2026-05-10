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
 */
export interface PermissionChecker {
  hasPermission(
    principal: OperatorPrincipal,
    required: Permission,
    headers?: Headers,
  ): Promise<boolean>;
}

export const PERMISSION_CHECKER = Symbol('PermissionChecker');
