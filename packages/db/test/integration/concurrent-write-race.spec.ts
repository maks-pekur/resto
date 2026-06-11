// PR 06 / TEN-08 Fixture 3 — Concurrent-write race (TDD).
//
// Threat T-06-03 (Tampering, HIGH): two concurrent `withTenant(A, ...)`
// and `withTenant(B, ...)` writers must each persist rows whose
// `tenant_id` matches the CALLING context — never the sibling's. If
// AsyncLocalStorage frames or the Postgres `app.current_tenant` GUC drift
// across the `pg_sleep(0.5)` window, one tenant's INSERT lands tagged
// with the other's id.
//
// Design (per D-07 §3 + Pitfall 5):
//   - Create a test-only table `test_concurrent_writes` inside this spec
//     via admin DDL. Enable RLS with the same `current_tenant_id()`-based
//     policy used by production tables (migrations/0001_rls_policies.sql)
//     so the table behaves exactly like real tenant-scoped tables for
//     this test.
//   - 20 iterations (per-iteration DB cost ~0.5s pg_sleep dominates), each
//     iteration `Promise.all`s a tenant-A write (with `pg_sleep(0.5)` to
//     widen the leak window) against a tenant-B write.
//   - The INSERT uses `current_setting('app.current_tenant')::uuid` —
//     this PROVES the GUC value is what determines the row's tenant_id;
//     a leak would show up as a tagged row mismatch.
//   - After each iteration: read both rows by marker and assert their
//     tenant_id matches the calling context's tenantId. Mismatch fails
//     immediately with iteration number + offending row.
//
// Red-then-green validation (skeptic check, ran during development,
// reverted before this commit):
//   The engineer temporarily replaced the INSERT's
//   `current_setting('app.current_tenant')::uuid` with a hard-coded
//   `${tenantA.id}` literal — this simulates a wrong-tenant write the
//   GUC-derived path would never produce. The spec failed at iteration 0
//   with a clear "expected tenantB, got tenantA" message, proving the
//   assertion catches the bug class. Restoration verified by re-running
//   the spec to PASS.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import postgres, { type Sql } from 'postgres';
import { runInTenantContext } from '../../src/index';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[concurrent-write-race] Docker not available — skipping integration tests.');
}

const ITERATIONS = 20;

suite('TEN-08 Fixture 3 — Concurrent withTenant writes do not drift tenant_id', () => {
  let pg: TestPg;
  let admin: Sql;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    pg = await startPostgres();
    admin = postgres(pg.adminUrl, { max: 1, prepare: false });

    // Provision two tenants via admin (the resto_app role cannot INSERT
    // into the tenants table — only the tenancy domain code can).
    const [a] = await admin<{ id: string }[]>`
      INSERT INTO tenants (slug, display_name)
      VALUES ('cwr-a', 'Concurrent Writes A')
      RETURNING id
    `;
    const [b] = await admin<{ id: string }[]>`
      INSERT INTO tenants (slug, display_name)
      VALUES ('cwr-b', 'Concurrent Writes B')
      RETURNING id
    `;
    if (!a || !b) throw new Error('failed to seed tenants');
    tenantA = a.id;
    tenantB = b.id;

    // Create the test-only table with the same RLS shape production
    // tenant-scoped tables use. The policy reuses the project's
    // is_system_session() / current_tenant_id() helpers from
    // migrations/0001_rls_policies.sql so the test exercises the same
    // RLS pattern, not a parallel one.
    await admin.unsafe(`
      CREATE TABLE test_concurrent_writes (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        marker text NOT NULL,
        PRIMARY KEY (id),
        CONSTRAINT test_concurrent_writes_tenant_fk
          FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      );
      ALTER TABLE test_concurrent_writes ENABLE ROW LEVEL SECURITY;
      ALTER TABLE test_concurrent_writes FORCE ROW LEVEL SECURITY;
      CREATE POLICY test_concurrent_writes_iso ON test_concurrent_writes
        USING (is_system_session() OR tenant_id = current_tenant_id())
        WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
      GRANT SELECT, INSERT ON test_concurrent_writes TO resto_app;
    `);
  }, 180_000);

  afterAll(async () => {
    try {
      await admin.unsafe(`DROP TABLE IF EXISTS test_concurrent_writes`);
    } finally {
      await admin.end({ timeout: 5 });
      await stopPostgres(pg);
    }
  });

  it(`${ITERATIONS.toString()} concurrent withTenant writes (with pg_sleep(0.5)) tag rows with the correct tenant_id`, async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const markerA = `A-${randomUUID()}`;
      const markerB = `B-${randomUUID()}`;
      const idA = randomUUID();
      const idB = randomUUID();

      await Promise.all([
        runInTenantContext({ tenantId: tenantA }, () =>
          pg.db.withTenant(async (tx) => {
            await tx.execute(sql`SELECT pg_sleep(0.5)`);
            await tx.execute(sql`
                INSERT INTO test_concurrent_writes (id, tenant_id, marker)
                VALUES (${idA}, current_setting('app.current_tenant')::uuid, ${markerA})
              `);
          }),
        ),
        runInTenantContext({ tenantId: tenantB }, () =>
          pg.db.withTenant(async (tx) => {
            await tx.execute(sql`
                INSERT INTO test_concurrent_writes (id, tenant_id, marker)
                VALUES (${idB}, current_setting('app.current_tenant')::uuid, ${markerB})
              `);
          }),
        ),
      ]);

      const rows = await pg.db.withoutTenant(
        `fixture 3: verify iteration ${i.toString()} rows`,
        async (tx) =>
          tx.execute<{ id: string; tenant_id: string; marker: string }>(
            sql`SELECT id, tenant_id, marker FROM test_concurrent_writes WHERE marker IN (${markerA}, ${markerB})`,
          ),
      );
      const byMarker = new Map(rows.map((r) => [r.marker, r]));
      const rowA = byMarker.get(markerA);
      const rowB = byMarker.get(markerB);
      if (!rowA || !rowB) {
        throw new Error(
          `Iteration ${i.toString()}: missing row(s) — markerA=${markerA} markerB=${markerB} rowsFound=${rows.length.toString()}`,
        );
      }
      if (rowA.tenant_id !== tenantA) {
        throw new Error(
          `Iteration ${i.toString()}: tenant_id drift on A — expected ${tenantA}, got ${rowA.tenant_id}`,
        );
      }
      if (rowB.tenant_id !== tenantB) {
        throw new Error(
          `Iteration ${i.toString()}: tenant_id drift on B — expected ${tenantB}, got ${rowB.tenant_id}`,
        );
      }
      expect(rowA.tenant_id).toBe(tenantA);
      expect(rowB.tenant_id).toBe(tenantB);
    }

    const total = await pg.db.withoutTenant('fixture 3: final total', async (tx) =>
      tx.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM test_concurrent_writes`),
    );
    const count = Number(total[0]?.n ?? '0');
    expect(count).toBe(ITERATIONS * 2);
  }, 60_000);
});
