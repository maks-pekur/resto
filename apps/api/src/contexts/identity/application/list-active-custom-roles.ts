import { and, eq, isNull } from 'drizzle-orm';
import { tenantRole } from '@resto/db/schema';
import type { AuthDrizzle } from '../infrastructure/better-auth/auth-db';

export interface ActiveCustomRole {
  readonly id: string;
  readonly role: string;
  readonly permission: Record<string, string[]>;
}

// BA's listOrgRoles API returns a bare array without the archived_at column, so
// archived roles can neither be excluded nor detected through it. Reading
// tenant_role directly is the only source that honours D-12 soft-delete.
export async function listActiveCustomRoles(
  authDb: AuthDrizzle,
  tenantId: string,
): Promise<ActiveCustomRole[]> {
  const rows = await authDb.db
    .select({
      id: tenantRole.id,
      role: tenantRole.role,
      permission: tenantRole.permission,
    })
    .from(tenantRole)
    .where(and(eq(tenantRole.tenantId, tenantId), isNull(tenantRole.archivedAt)));

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    permission: JSON.parse(row.permission) as Record<string, string[]>,
  }));
}
