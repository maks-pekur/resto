import type { SQL } from 'drizzle-orm';
import { type TenantAwareDb, type RestoTx, type ScopedTx, type TenantScopedTable } from './client';

export abstract class TenantScopedRepository {
  constructor(protected readonly db: TenantAwareDb) {}

  protected withTenant<T>(op: (scoped: ScopedTx, tx: RestoTx) => Promise<T>): Promise<T> {
    return this.db.withTenant((tx, scoped) => op(scoped, tx));
  }

  protected selectMany<T extends TenantScopedTable>(
    table: T,
    extraWhere?: SQL,
  ): Promise<T['$inferSelect'][]> {
    return this.withTenant((scoped) => scoped.selectFrom(table, extraWhere));
  }

  protected async selectOne<T extends TenantScopedTable>(
    table: T,
    extraWhere?: SQL,
  ): Promise<T['$inferSelect'] | null> {
    return this.withTenant(async (scoped) => {
      const rows = await scoped.selectFrom(table, extraWhere).limit(1);
      return rows[0] ?? null;
    });
  }
}
