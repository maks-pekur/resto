import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';
import { runAudit } from '../../src/cli/audit-fks';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[audit-fks] Docker not available — skipping integration tests.');
}

suite('RES-255: db:audit-fks detects non-composite parent FKs on tenant-scoped children', () => {
  let pg: TestPg;

  beforeAll(async () => {
    pg = await startPostgres();
  }, 90_000);

  afterAll(async () => {
    await stopPostgres(pg);
  });

  afterEach(async () => {
    const adminClient = postgres(pg.adminUrl, { max: 1, prepare: false });
    const adminDb = drizzle(adminClient);
    try {
      await adminDb.execute(sql`DROP TABLE IF EXISTS audit_fks_violation_fixture`);
    } finally {
      await adminClient.end({ timeout: 5 });
    }
  });

  it('happy: clean schema after migrations → 0 violations', async () => {
    const violations = await runAudit(pg.db);
    expect(violations).toEqual([]);
  });

  it('sad: a fixture child table with non-composite parent FK is detected', async () => {
    const adminClient = postgres(pg.adminUrl, { max: 1, prepare: false });
    const adminDb = drizzle(adminClient);
    try {
      await adminDb.execute(sql`
        CREATE TABLE audit_fks_violation_fixture (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id),
          brand_id uuid NOT NULL REFERENCES brands(id)
        )
      `);
    } finally {
      await adminClient.end({ timeout: 5 });
    }

    const violations = await runAudit(pg.db);
    expect(violations).toContainEqual(
      expect.objectContaining({
        childTable: 'audit_fks_violation_fixture',
        childCol: 'brand_id',
        parentTable: 'brands',
      }),
    );
  });
});
