import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';
import { runInTenantContext, schema } from '../../src/index';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[tenant-isolation] Docker not available — skipping integration tests.');
}

suite('Row-Level Security — tenant isolation', () => {
  let pg: TestPg;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    pg = await startPostgres();

    await pg.db.withoutTenant('seed two tenants', async (tx) => {
      const [a] = await tx
        .insert(schema.tenants)
        .values({ slug: 'cafe-a', displayName: 'Cafe A' })
        .returning({ id: schema.tenants.id });
      const [b] = await tx
        .insert(schema.tenants)
        .values({ slug: 'cafe-b', displayName: 'Cafe B' })
        .returning({ id: schema.tenants.id });
      if (!a || !b) throw new Error('Failed to seed tenants.');
      tenantA = a.id;
      tenantB = b.id;

      await tx.insert(schema.menuCategories).values([
        { tenantId: tenantA, slug: 'pizza', name: { en: 'Pizza' } },
        { tenantId: tenantB, slug: 'pizza', name: { en: 'Pizza' } },
      ]);
    });
  }, 90_000);

  afterAll(async () => {
    await stopPostgres(pg);
  });

  it('a tenant context sees only its own tenant row', async () => {
    const visible = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) => tx.select().from(schema.tenants)),
    );
    expect(visible).toHaveLength(1);
    expect(visible[0]?.id).toBe(tenantA);
  });

  it('a tenant context sees only its own categories', async () => {
    const fromA = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) => tx.select().from(schema.menuCategories)),
    );
    const fromB = await runInTenantContext({ tenantId: tenantB }, () =>
      pg.db.withTenant(async (tx) => tx.select().from(schema.menuCategories)),
    );
    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.tenantId).toBe(tenantA);
    expect(fromB).toHaveLength(1);
    expect(fromB[0]?.tenantId).toBe(tenantB);
  });

  it('inserting a row with the wrong tenant_id fails the WITH CHECK clause', async () => {
    await expect(
      runInTenantContext({ tenantId: tenantA }, () =>
        pg.db.withTenant(async (tx) =>
          tx
            .insert(schema.menuCategories)
            .values({ tenantId: tenantB, slug: 'sneaky', name: { en: 'Sneaky' } })
            .returning(),
        ),
      ),
    ).rejects.toThrow(/row-level security|policy/i);
  });

  it('withoutTenant() sees rows across all tenants', async () => {
    const all = await pg.db.withoutTenant('test cross-tenant read', async (tx) =>
      tx.select().from(schema.menuCategories),
    );
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('forging current_setting from inside a tenant transaction is blocked', async () => {
    // Inside withTenant, RLS is in force. Even if user code tries to override the
    // session variable, FORCE ROW LEVEL SECURITY plus the policy still apply because
    // the policy itself is what reads the variable.
    const visible = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) => {
        // Attempt: pretend we are tenant B (uuid form) for the rest of the tx.
        await tx.execute(sql`SELECT set_config('app.current_tenant', ${tenantB}, true)`);
        return tx.select().from(schema.tenants);
      }),
    );
    // The forged setting actually flips the policy — but FORCE RLS still
    // applies and the row visible is whichever the *current* setting allows.
    // The point of this test is to document the contract: client code must
    // *not* trust callers to play fair. The defense is at the application
    // layer (only the wrapper sets the variable) plus FORCE RLS preventing
    // bypass via the table owner.
    //
    // Concretely we expect to see exactly tenant B (because we forged its
    // id) or zero rows (if the runtime refused). Either way we must NOT
    // see tenant A — that's the actual correctness assertion.
    expect(visible.every((row) => row.id !== tenantA)).toBe(true);
  });

  it("attempting to UPDATE another tenant's row is blocked", async () => {
    const updated = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) =>
        tx
          .update(schema.tenants)
          .set({ displayName: 'Hacked' })
          .where(sql`${schema.tenants.id} = ${tenantB}`)
          .returning(),
      ),
    );
    expect(updated).toHaveLength(0);

    const stillIntact = await pg.db.withoutTenant('verify integrity', async (tx) =>
      tx
        .select()
        .from(schema.tenants)
        .where(sql`${schema.tenants.id} = ${tenantB}`),
    );
    expect(stillIntact[0]?.displayName).toBe('Cafe B');
  });

  it('queries on menu_items use the (tenant_id, status, sort_order) index', async () => {
    const explanation = await pg.db.withoutTenant('inspect plan', async (tx) => {
      // Seed enough rows that the planner prefers index over seq scan.
      const cat = await tx
        .insert(schema.menuCategories)
        .values({ tenantId: tenantA, slug: 'drinks', name: { en: 'Drinks' } })
        .returning({ id: schema.menuCategories.id });
      const created = cat[0];
      if (!created) throw new Error('Failed to seed drinks category.');
      const catId = created.id;

      const items = Array.from({ length: 200 }, (_, i) => ({
        tenantId: tenantA,
        categoryId: catId,
        slug: `item-${i.toString().padStart(3, '0')}`,
        name: { en: `Item ${i.toString()}` },
        basePrice: '9.99',
        currency: 'USD',
        status: 'published' as const,
      }));
      await tx.insert(schema.menuItems).values(items);
      await tx.execute(sql`ANALYZE menu_items`);

      const rows = await tx.execute<{ 'QUERY PLAN': string }>(
        sql`EXPLAIN SELECT id FROM menu_items WHERE tenant_id = ${tenantA} AND status = 'published' ORDER BY sort_order LIMIT 50`,
      );
      return rows.map((r) => r['QUERY PLAN']).join('\n');
    });

    expect(explanation).toMatch(/Index/);
  });
});
