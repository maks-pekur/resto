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
 */
export interface PermissionChecker {
  hasPermission(principal: OperatorPrincipal, required: Permission): Promise<boolean>;
}

export const PERMISSION_CHECKER = Symbol('PermissionChecker');
