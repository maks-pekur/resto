import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { runInTenantContext, schema, ScopedTx } from '../../src/index';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[scoped-tx] Docker not available — skipping integration tests.');
}

/**
 * Each case uses its own slug prefix so seed rows from different tests do
 * not collide. `resto_app` lacks DELETE privilege by policy (see
 * `packages/db/sql/roles.sql:39`), so we cannot truncate between tests —
 * isolation by slug is the project-policy-compatible alternative.
 */
suite('ScopedTx — tenant-scoped Drizzle helper', () => {
  let pg: TestPg;
  let tenantA: string;
  let tenantB: string;
  let brandA: string;
  let brandB: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await pg.db.withoutTenant('seed tenants for scoped-tx test', async (tx) => {
      const [a] = await tx
        .insert(schema.tenants)
        .values({ slug: 'scoped-a', displayName: 'Scoped A' })
        .returning({ id: schema.tenants.id });
      const [b] = await tx
        .insert(schema.tenants)
        .values({ slug: 'scoped-b', displayName: 'Scoped B' })
        .returning({ id: schema.tenants.id });
      if (!a || !b) throw new Error('Failed to seed tenants.');
      tenantA = a.id;
      tenantB = b.id;
      const [ba] = await tx
        .insert(schema.brands)
        .values({ tenantId: tenantA, slug: 'scoped-a-brand', displayName: 'Scoped A Brand' })
        .returning({ id: schema.brands.id });
      const [bb] = await tx
        .insert(schema.brands)
        .values({ tenantId: tenantB, slug: 'scoped-b-brand', displayName: 'Scoped B Brand' })
        .returning({ id: schema.brands.id });
      if (!ba || !bb) throw new Error('Failed to seed brands.');
      brandA = ba.id;
      brandB = bb.id;
    });
  }, 90_000);

  afterAll(async () => {
    await stopPostgres(pg);
  });

  it('selectFrom auto-applies tenant filter', async () => {
    await pg.db.withoutTenant('seed case-1 rows', async (tx) => {
      await tx.insert(schema.menuCategories).values([
        { tenantId: tenantA, brandId: brandA, slug: 'c1-pizza', name: { en: 'C1 Pizza A' } },
        { tenantId: tenantB, brandId: brandB, slug: 'c1-pizza', name: { en: 'C1 Pizza B' } },
      ]);
    });
    const rows = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (_tx, scoped) =>
        scoped.selectFrom(schema.menuCategories, eq(schema.menuCategories.slug, 'c1-pizza')),
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenantId).toBe(tenantA);
    expect(rows[0]?.slug).toBe('c1-pizza');
  });

  it('selectFrom composes extra where with AND', async () => {
    await pg.db.withoutTenant('seed case-2 rows', async (tx) => {
      await tx.insert(schema.menuCategories).values([
        { tenantId: tenantA, brandId: brandA, slug: 'c2-pizza', name: { en: 'C2 Pizza A' } },
        { tenantId: tenantA, brandId: brandA, slug: 'c2-burger', name: { en: 'C2 Burger A' } },
        { tenantId: tenantB, brandId: brandB, slug: 'c2-pizza', name: { en: 'C2 Pizza B' } },
      ]);
    });
    const rows = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (_tx, scoped) =>
        scoped.selectFrom(schema.menuCategories, eq(schema.menuCategories.slug, 'c2-pizza')),
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenantId).toBe(tenantA);
    expect(rows[0]?.slug).toBe('c2-pizza');
  });

  it('selectFrom chains Drizzle ops (.limit)', async () => {
    await pg.db.withoutTenant('seed case-3 rows', async (tx) => {
      await tx.insert(schema.menuCategories).values([
        { tenantId: tenantA, brandId: brandA, slug: 'c3-one', name: { en: 'One' } },
        { tenantId: tenantA, brandId: brandA, slug: 'c3-two', name: { en: 'Two' } },
        { tenantId: tenantA, brandId: brandA, slug: 'c3-three', name: { en: 'Three' } },
      ]);
    });
    const rows = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (_tx, scoped) =>
        scoped.selectFrom(schema.menuCategories, eq(schema.menuCategories.slug, 'c3-one')).limit(1),
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.slug).toBe('c3-one');
    expect(rows[0]?.tenantId).toBe(tenantA);
  });

  it('insertInto auto-injects tenantId', async () => {
    await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (_tx, scoped) =>
        scoped.insertInto(schema.menuCategories, {
          brandId: brandA,
          slug: 'c4-pizza',
          name: { en: 'C4 Pizza' },
        }),
      ),
    );
    const rows = await pg.db.withoutTenant('verify c4 row', async (tx) =>
      tx.select().from(schema.menuCategories).where(eq(schema.menuCategories.slug, 'c4-pizza')),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenantId).toBe(tenantA);
  });

  it('insertInto throws if values include tenantId', async () => {
    const error = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db
        .withTenant(async (_tx, scoped) =>
          scoped.insertInto(schema.menuCategories, {
            tenantId: tenantB,
            brandId: brandB,
            slug: 'c5-sneaky',
            name: { en: 'Sneaky' },
          } as never),
        )
        .then(
          () => null,
          (e: unknown) => e,
        ),
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/values must not include tenantId/i);

    const rows = await pg.db.withoutTenant('verify c5 no insert', async (tx) =>
      tx.select().from(schema.menuCategories).where(eq(schema.menuCategories.slug, 'c5-sneaky')),
    );
    expect(rows).toHaveLength(0);
  });

  it('updateTable auto-filters by tenantId', async () => {
    await pg.db.withoutTenant('seed case-6 rows', async (tx) => {
      await tx.insert(schema.menuCategories).values([
        { tenantId: tenantA, brandId: brandA, slug: 'c6-pizza', name: { en: 'C6 Pizza A' } },
        { tenantId: tenantB, brandId: brandB, slug: 'c6-pizza', name: { en: 'C6 Pizza B' } },
      ]);
    });
    await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (_tx, scoped) =>
        scoped.updateTable(
          schema.menuCategories,
          { name: { en: 'C6 Updated A' } },
          eq(schema.menuCategories.slug, 'c6-pizza'),
        ),
      ),
    );
    const all = await pg.db.withoutTenant('inspect c6 after update', async (tx) =>
      tx.select().from(schema.menuCategories).where(eq(schema.menuCategories.slug, 'c6-pizza')),
    );
    const a = all.find((r) => r.tenantId === tenantA);
    const b = all.find((r) => r.tenantId === tenantB);
    expect(a?.name).toEqual({ en: 'C6 Updated A' });
    expect(b?.name).toEqual({ en: 'C6 Pizza B' });
  });

  it('withTenant callback receives ScopedTx as 2nd argument', async () => {
    const result = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant((_tx, scoped) => Promise.resolve(scoped instanceof ScopedTx)),
    );
    expect(result).toBe(true);
  });

  it('withTenantId callback receives ScopedTx (no-ALS path)', async () => {
    await pg.db.withoutTenant('seed case-8 row', async (tx) => {
      await tx
        .insert(schema.menuCategories)
        .values({ tenantId: tenantA, brandId: brandA, slug: 'c8-wtid', name: { en: 'WTID' } });
    });
    const rows = await pg.db.withTenantId(tenantA, async (_tx, scoped) =>
      scoped.selectFrom(schema.menuCategories, eq(schema.menuCategories.slug, 'c8-wtid')),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenantId).toBe(tenantA);
  });

  it('withoutTenant callback signature stays 1-arg (compile-time pin)', async () => {
    const ok = await pg.db.withoutTenant('compile-time pin', (tx) =>
      tx
        .select()
        .from(schema.menuCategories)
        .where(and(eq(schema.menuCategories.tenantId, tenantA)))
        .then(() => true),
    );
    expect(ok).toBe(true);
  });
});
