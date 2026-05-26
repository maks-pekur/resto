// TEN-13: deletes inbox_processed rows older than N days. Runs under
// withoutTenant because the sweep is platform-level (covers both tenant-scoped
// and platform rows). The narrow GRANT in migration 0028 is the ONLY DELETE
// privilege resto_app holds.
import { sql } from 'drizzle-orm';
import type { TenantAwareDb } from './client';

export const deleteInboxProcessedOlderThan = async (
  db: TenantAwareDb,
  days: number,
): Promise<{ deleted: number }> => {
  if (!Number.isInteger(days) || days <= 0) {
    throw new RangeError(
      `deleteInboxProcessedOlderThan: days must be a positive integer, got ${String(days)}.`,
    );
  }
  return db.withoutTenant('inbox-retention-sweep', async (tx) => {
    const result = await tx.execute(
      sql`DELETE FROM inbox_processed WHERE processed_at < NOW() - (${days} || ' days')::interval`,
    );
    // postgres.js execute returns an array-like result with a `count` field on
    // the underlying Result for DELETE/UPDATE. Drizzle re-exports it as length.
    const rowsAffected = (result as { rowCount?: number; count?: number; length?: number })
      .rowCount;
    const count =
      typeof rowsAffected === 'number'
        ? rowsAffected
        : ((result as { count?: number }).count ?? (result as { length?: number }).length ?? 0);
    return { deleted: count };
  });
};
