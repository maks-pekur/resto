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
    const error = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) =>
        tx
          .insert(schema.menuCategories)
          .values({ tenantId: tenantB, slug: 'sneaky', name: { en: 'Sneaky' } })
          .returning(),
      ),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    const cause = (error as Error).cause;
    expect(cause).toBeInstanceOf(Error);
    expect((cause as Error).message).toMatch(/row-level security|policy/i);
  });

  it('withoutTenant() sees rows across all tenants', async () => {
    const all = await pg.db.withoutTenant('test cross-tenant read', async (tx) =>
      tx.select().from(schema.menuCategories),
    );
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('RES-243: forge via SET LOCAL is caught by drift sentinel', async () => {
    // REVOKE EXECUTE on set_config does not block the top-level `SET LOCAL`
    // SQL command — Postgres has no privilege mechanism for that on custom
    // GUCs. The end-of-callback drift sentinel is the defense.
    const error = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant = '${tenantB}'`));
        return tx.select().from(schema.tenants);
      }),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/Tenant GUC drift detected/);
  });

  it('RES-243: forge via RESET is caught by drift sentinel', async () => {
    const error = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) => {
        await tx.execute(sql`RESET app.current_tenant`);
        return tx.select().from(schema.tenants);
      }),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/Tenant GUC drift detected/);
  });

  it('RES-243: binding a tenant inside withoutTenant is caught', async () => {
    // Outer `withoutTenant` expects current_tenant=''. If a callback rebinds
    // to a tenant uuid, the wrapper allows the transition (current was '')
    // but the outer drift sentinel catches it on exit.
    const error = await pg.db
      .withoutTenant('test cross-context binding', async (tx) => {
        await tx.execute(sql`SELECT app_bind_tenant(${tenantA}, false)`);
        return tx.select().from(schema.tenants);
      })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/Tenant GUC drift detected in withoutTenant/);
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

  it('RES-243: forge via set_config() is blocked at the role level', async () => {
    // After migration 0023, `pg_catalog.set_config(text, text, boolean)` is
    // REVOKED from PUBLIC. resto_app can no longer call set_config directly;
    // attempting to do so inside a withTenant block fails immediately with
    // SQLSTATE 42501 — the transaction rolls back before the drift sentinel
    // would have had a chance to fire.
    const error = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.current_tenant', ${tenantB}, true)`);
        return tx.select().from(schema.tenants);
      }),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    const cause = (error as Error).cause as { code?: string } | undefined;
    expect(cause?.code).toBe('42501');
  });

  it('accepts an explicit brand_id on menu_categories (nullable column exists)', async () => {
    const [brand] = await pg.db.withoutTenant('seed brand for column smoke', async (tx) =>
      tx
        .insert(schema.brands)
        .values({ tenantId: tenantA, slug: 'col-smoke', displayName: 'ColSmoke' })
        .returning({ id: schema.brands.id }),
    );
    if (!brand) throw new Error('seed failed');

    await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) => {
        await tx.insert(schema.menuCategories).values({
          tenantId: tenantA,
          slug: 'col-smoke-cat',
          name: { en: 'ColSmoke' },
          brandId: brand.id,
        });
      }),
    );

    await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) => {
        await tx.insert(schema.menuCategories).values({
          tenantId: tenantA,
          slug: 'col-smoke-cat-2',
          name: { en: 'ColSmoke2' },
          brandId: null,
        });
      }),
    );
  });
});
