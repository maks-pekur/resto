import { sql } from 'drizzle-orm';
import { createDb, type TenantAwareDb } from '../index';
import { logger } from '../logger';

export interface AuditViolation {
  childTable: string;
  childCol: string;
  parentTable: string;
  fkConstraintName: string;
}

export const runAudit = async (db: TenantAwareDb): Promise<AuditViolation[]> => {
  return db.withoutTenant('audit-fks: I-2 scan', async (tx) => {
    const rows = await tx.execute<{
      child_table: string;
      child_col: string;
      parent_table: string;
      fk_name: string;
    }>(sql`
      WITH tenant_scoped_tables AS (
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'tenant_id'
          AND is_nullable = 'NO'
      ),
      fk_summary AS (
        SELECT
          c.conname            AS fk_name,
          cl.relname           AS child_table,
          (SELECT attname FROM pg_attribute
             WHERE attrelid = c.conrelid AND attnum = c.conkey[1]) AS child_col,
          parent_cl.relname    AS parent_table
        FROM pg_constraint c
        JOIN pg_class cl ON cl.oid = c.conrelid
        JOIN pg_class parent_cl ON parent_cl.oid = c.confrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE c.contype = 'f'
          AND n.nspname = 'public'
          AND cl.relname IN (SELECT table_name FROM tenant_scoped_tables)
          AND parent_cl.relname IN (SELECT table_name FROM tenant_scoped_tables)
          AND cardinality(c.conkey) = 1
      )
      SELECT child_table, child_col, parent_table, fk_name
      FROM fk_summary
      WHERE child_col <> 'tenant_id'
      ORDER BY child_table, child_col;
    `);

    return rows.map((r) => ({
      childTable: r.child_table,
      childCol: r.child_col,
      parentTable: r.parent_table,
      fkConstraintName: r.fk_name,
    }));
  });
};

const main = async (): Promise<void> => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    logger.error('DATABASE_URL is required to run db:audit-fks.');
    process.exit(1);
  }

  const db = createDb({ url });
  try {
    const violations = await runAudit(db);
    if (violations.length === 0) {
      logger.info('db:audit-fks: no I-2 violations.');
      return;
    }
    logger.error({ count: violations.length, violations }, 'db:audit-fks: I-2 violations detected');
    for (const v of violations) {
      console.error(
        `  • ${v.childTable}.${v.childCol} → ${v.parentTable} (constraint ${v.fkConstraintName}) is single-column; expected composite (parent_id, tenant_id) → ${v.parentTable}(id, tenant_id)`,
      );
    }
    process.exit(1);
  } finally {
    await db.close();
  }
};

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err: unknown) => {
    logger.error({ err }, 'db:audit-fks failed.');
    process.exit(1);
  });
}
