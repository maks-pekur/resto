import { and, eq, isNull } from 'drizzle-orm';
import { APIError } from 'better-auth/api';
import { containsNonDelegatable, SYSTEM_ROLES } from '@resto/domain';
import { tenantRole as tenantRoleTable } from '@resto/db/schema';
import type { AuthDrizzle } from './auth-db';

/**
 * T-083-17 (08.3): defense-in-depth backstop for role assignment — fires even
 * when a caller bypasses assign-role.service and hits BA's endpoint directly.
 *
 * Lives here rather than inline in `buildAuth()` so it can be unit-tested
 * against the real implementation. The previous unit test carried an inline
 * replica of this logic that silently drifted from production (its
 * `SYSTEM_ROLES.admin` lacked `staff: ['remove']`), which is why the
 * unassignable-`admin` defect stayed green in CI from 2026-07-04.
 *
 * Throws BA's own `APIError`, NOT a NestJS exception: this runs inside a
 * better-call handler, which turns any foreign throw into a 500. A refusal
 * here is an authorization decision and must reach the client as 403.
 */
export const assertRoleAssignable = async (input: {
  newRole: string;
  orgId: string;
  authDb: AuthDrizzle;
}): Promise<void> => {
  const { newRole, orgId, authDb } = input;

  let targetPermission: Record<string, string[]> | null = null;
  const systemRole = (SYSTEM_ROLES as Record<string, Record<string, readonly string[]>>)[newRole];

  if (systemRole) {
    targetPermission = Object.fromEntries(Object.entries(systemRole).map(([r, a]) => [r, [...a]]));
  } else {
    try {
      const rows = await authDb.db
        .select({ permission: tenantRoleTable.permission })
        .from(tenantRoleTable)
        .where(
          and(
            eq(tenantRoleTable.tenantId, orgId),
            eq(tenantRoleTable.role, newRole),
            isNull(tenantRoleTable.archivedAt),
          ),
        )
        .limit(1);
      const raw = rows[0]?.permission;
      if (typeof raw === 'string') {
        targetPermission = JSON.parse(raw) as Record<string, string[]>;
      }
    } catch {
      throw new APIError('FORBIDDEN', {
        code: 'role.insufficient_permissions',
        message: 'Cannot verify target role permissions.',
      });
    }
    // T-083-17 (08.3): unknown/archived slug → deny by default (fail closed)
    if (targetPermission === null) {
      throw new APIError('FORBIDDEN', {
        code: 'role.insufficient_permissions',
        message: 'Unknown or archived target role.',
      });
    }
  }

  if (containsNonDelegatable(targetPermission)) {
    throw new APIError('FORBIDDEN', {
      code: 'role.insufficient_permissions',
      message: 'You cannot assign a role bearing non-delegatable permissions.',
    });
  }
};
