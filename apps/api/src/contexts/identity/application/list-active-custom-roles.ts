import { and, eq, isNull } from 'drizzle-orm';
import { organizationRole } from '@resto/db/schema';
import type { AuthDrizzle } from '../infrastructure/better-auth/auth-db';

export interface ActiveCustomRole {
  readonly id: string;
  readonly role: string;
  readonly permission: Record<string, string[]>;
}

// BA's listOrgRoles API returns a bare array without the archived_at column, so
// archived roles can neither be excluded nor detected through it. Reading
// organization_role directly is the only source that honours D-12 soft-delete.
export async function listActiveCustomRoles(
  authDb: AuthDrizzle,
  organizationId: string,
): Promise<ActiveCustomRole[]> {
  const rows = await authDb.db
    .select({
      id: organizationRole.id,
      role: organizationRole.role,
      permission: organizationRole.permission,
    })
    .from(organizationRole)
    .where(
      and(eq(organizationRole.organizationId, organizationId), isNull(organizationRole.archivedAt)),
    );

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    permission: JSON.parse(row.permission) as Record<string, string[]>,
  }));
}
