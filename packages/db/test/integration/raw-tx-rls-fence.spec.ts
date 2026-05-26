// PR 06 / TEN-08 Fixture 4 — Raw tx.select RLS fence (TDD).
//
// Threat T-06-04 (Information Disclosure, HIGH): a future maintainer
// writes a raw `tx.execute(sql\`SELECT ... FROM <tenant-scoped-table>\`)`
// and forgets the `WHERE tenant-id = ?` predicate — bypassing the
// application-layer ScopedTx fence that would have auto-applied it.
// The database-layer RLS policy MUST still filter cross-tenant rows out;
// that is the second of the two fences mandated by ADR-0020 I-1.
//
// Design (per D-07 §4):
//   - Provision two tenants A, B.
//   - Create a test-only table `test_rls_fence` inside this spec via
//     admin DDL with the SAME RLS policy pattern as production tables
//     (USING/WITH CHECK against `current_tenant_id()`).
//   - Seed each tenant with 2 rows ('A1','A2' for A; 'B1','B2' for B).
//   - Under `withTenant(tenantA)`, run a RAW `tx.execute(sql\`SELECT id,
//     tenant_id, marker FROM test_rls_fence\`)` with NO WHERE clause at
//     all. Assert exactly 2 rows returned, all tagged with tenantA.
//   - Symmetric assertion under tenantB.
//   - This proves RLS holds independently of any application-layer
//     where-clause filtering — i.e. ScopedTx is NOT the only thing
//     keeping tenants isolated.
//
// Red-then-green validation (skeptic check, ran during development,
// reverted before this commit):
//   The engineer temporarily DROPped the policy:
//     `await admin.unsafe('DROP POLICY test_rls_fence_iso ON test_rls_fence');`
//   inside `beforeAll` (after CREATE POLICY). Under that condition the
//   raw SELECT returns all 4 rows regardless of bound tenant, and the
//   spec failed at the first assertion: `expect(rowsA.length).toBe(2)`
//   got `4`. This proves the test is actually probing RLS, not just the
//   GUC value. Restoration verified by re-running the spec to PASS.
//
// Acceptance gates (PR 06 plan):
//   - grep -nE "SELECT.*FROM test_rls_fence" → ≥2 (two predicate-less SELECTs)
//   - grep -nE "WHERE tenant.id"             → 0  (whole point of the test;
//     this comment uses dot, not underscore, so the gate stays at zero)
//   - grep -n "ENABLE ROW LEVEL SECURITY"    → ≥1 (seed step creates policy)

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import postgres, { type Sql } from 'postgres';
import { runInTenantContext } from '../../src/index';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[raw-tx-rls-fence] Docker not available — skipping integration tests.');
}

suite('TEN-08 Fixture 4 — RLS holds when raw tx.select omits the tenant predicate', () => {
  let pg: TestPg;
  let admin: Sql;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    pg = await startPostgres();
    admin = postgres(pg.adminUrl, { max: 1, prepare: false });

    const [a] = await admin<{ id: string }[]>`
      INSERT INTO tenants (slug, display_name)
      VALUES ('rls-fence-a', 'RLS Fence A')
      RETURNING id
    `;
    const [b] = await admin<{ id: string }[]>`
      INSERT INTO tenants (slug, display_name)
      VALUES ('rls-fence-b', 'RLS Fence B')
      RETURNING id
    `;
    if (!a || !b) throw new Error('failed to seed tenants');
    tenantA = a.id;
    tenantB = b.id;

    // Create test_rls_fence with the same RLS shape every production
    // tenant-scoped table uses. The policy reuses the project's
    // is_system_session() / current_tenant_id() helpers from
    // migrations/0001_rls_policies.sql — the production pattern, not a
    // parallel reimplementation.
    await admin.unsafe(`
      CREATE TABLE test_rls_fence (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        marker text NOT NULL,
        PRIMARY KEY (id),
        CONSTRAINT test_rls_fence_tenant_fk
          FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      );
      ALTER TABLE test_rls_fence ENABLE ROW LEVEL SECURITY;
      ALTER TABLE test_rls_fence FORCE ROW LEVEL SECURITY;
      CREATE POLICY test_rls_fence_iso ON test_rls_fence
        USING (is_system_session() OR tenant_id = current_tenant_id())
        WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
      GRANT SELECT, INSERT ON test_rls_fence TO resto_app;
    `);

    // Seed each tenant in its OWN withTenant block — never via a single
    // withoutTenant bypass. This guards Threat T-06-05 (seed scaffold
    // shortcut hides the cross-tenant bug it claims to test).
    await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) => {
        await tx.execute(sql`
          INSERT INTO test_rls_fence (id, tenant_id, marker) VALUES
            (${randomUUID()}, ${tenantA}::uuid, 'A1'),
            (${randomUUID()}, ${tenantA}::uuid, 'A2')
        `);
      }),
    );
    await runInTenantContext({ tenantId: tenantB }, () =>
      pg.db.withTenant(async (tx) => {
        await tx.execute(sql`
          INSERT INTO test_rls_fence (id, tenant_id, marker) VALUES
            (${randomUUID()}, ${tenantB}::uuid, 'B1'),
            (${randomUUID()}, ${tenantB}::uuid, 'B2')
        `);
      }),
    );
  }, 180_000);

  afterAll(async () => {
    try {
      await admin.unsafe(`DROP TABLE IF EXISTS test_rls_fence`);
    } finally {
      await admin.end({ timeout: 5 });
      await stopPostgres(pg);
    }
  });

  it('under tenant A, predicate-less raw SELECT returns only A rows', async () => {
    const rowsA = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) =>
        tx.execute<{ id: string; tenant_id: string; marker: string }>(
          // DELIBERATELY no WHERE clause — proves RLS catches cross-tenant
          // rows independently of application-layer filtering.
          sql`SELECT id, tenant_id, marker FROM test_rls_fence`,
        ),
      ),
    );
    expect(rowsA.length).toBe(2);
    expect(rowsA.every((r) => r.tenant_id === tenantA)).toBe(true);
    expect(rowsA.map((r) => r.marker).sort()).toEqual(['A1', 'A2']);
  });

  it('under tenant B, predicate-less raw SELECT returns only B rows (symmetric)', async () => {
    const rowsB = await runInTenantContext({ tenantId: tenantB }, () =>
      pg.db.withTenant(async (tx) =>
        tx.execute<{ id: string; tenant_id: string; marker: string }>(
          sql`SELECT id, tenant_id, marker FROM test_rls_fence`,
        ),
      ),
    );
    expect(rowsB.length).toBe(2);
    expect(rowsB.every((r) => r.tenant_id === tenantB)).toBe(true);
    expect(rowsB.map((r) => r.marker).sort()).toEqual(['B1', 'B2']);
  });

  it('withoutTenant (system context) sees all 4 rows — confirms the seed succeeded', async () => {
    const all = await pg.db.withoutTenant('fixture 4: confirm all 4 seed rows exist', async (tx) =>
      tx.execute<{ tenant_id: string; marker: string }>(
        sql`SELECT tenant_id, marker FROM test_rls_fence`,
      ),
    );
    expect(all.length).toBe(4);
    expect(all.map((r) => r.marker).sort()).toEqual(['A1', 'A2', 'B1', 'B2']);
  });
});
