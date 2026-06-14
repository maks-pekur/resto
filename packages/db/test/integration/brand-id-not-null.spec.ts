import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { schema } from '../../src/index';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[brand-id-not-null] Docker not available — skipping integration tests.');
}

const NOT_NULL_TABLES = [
  'menu_items',
  'menu_categories',
  'menu_item_sizes',
  'menu_modifier_groups',
  'menu_modifier_options',
  'menu_item_modifier_groups',
] as const;

interface NullableRow {
  is_nullable: string;
}

interface IndexRow {
  indexname: string;
}

suite('migration 0044 — brand_id NOT NULL + brand-scoped slug index', () => {
  let pg: TestPg;

  beforeAll(async () => {
    pg = await startPostgres();
  }, 90_000);

  afterAll(async () => {
    await stopPostgres(pg);
  });

  describe.each(NOT_NULL_TABLES)('%s.brand_id', (table) => {
    it('is NOT NULL', async () => {
      const rows = await pg.db.withoutTenant('introspect brand_id nullability', async (tx) => {
        const result = await tx.execute(sql`
          SELECT is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = ${table}
            AND column_name = 'brand_id'
        `);
        return result as unknown as NullableRow[];
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.is_nullable).toBe('NO');
    });
  });

  describe.each(['menu_items', 'menu_categories'] as const)('%s slug uniqueness index', (table) => {
    const brandIdx = `${table}_brand_slug_uq`;
    const tenantIdx = `${table}_tenant_slug_uq`;

    it(`has ${brandIdx} and not ${tenantIdx}`, async () => {
      const names = await pg.db.withoutTenant('introspect slug indexes', async (tx) => {
        const result = await tx.execute(sql`
          SELECT indexname
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = ${table}
        `);
        return (result as unknown as IndexRow[]).map((r) => r.indexname);
      });
      expect(names).toContain(brandIdx);
      expect(names).not.toContain(tenantIdx);
    });
  });

  it('brand-scoped slug uniqueness: same slug across brands allowed, duplicate within a brand rejected', async () => {
    const { brandA, brandB, tenantId } = await pg.db.withoutTenant(
      'seed brand-scoped slug fixtures',
      async (tx) => {
        const [tenant] = await tx
          .insert(schema.tenants)
          .values({ slug: 'bnn-tenant', displayName: 'BNN Tenant' })
          .returning({ id: schema.tenants.id });
        if (!tenant) throw new Error('seed tenant failed');
        const [bA] = await tx
          .insert(schema.brands)
          .values({ tenantId: tenant.id, slug: 'bnn-brand-a', displayName: 'BNN Brand A' })
          .returning({ id: schema.brands.id });
        const [bB] = await tx
          .insert(schema.brands)
          .values({ tenantId: tenant.id, slug: 'bnn-brand-b', displayName: 'BNN Brand B' })
          .returning({ id: schema.brands.id });
        if (!bA || !bB) throw new Error('seed brands failed');
        return { brandA: bA.id, brandB: bB.id, tenantId: tenant.id };
      },
    );

    await pg.db.withoutTenant('insert same slug across brands', async (tx) => {
      await tx.insert(schema.menuCategories).values({
        tenantId,
        brandId: brandA,
        slug: 'shared-slug',
        name: { en: 'In Brand A' },
      });
      await tx.insert(schema.menuCategories).values({
        tenantId,
        brandId: brandB,
        slug: 'shared-slug',
        name: { en: 'In Brand B' },
      });
    });

    const error = await pg.db
      .withoutTenant('insert duplicate slug within same brand', async (tx) =>
        tx.insert(schema.menuCategories).values({
          tenantId,
          brandId: brandA,
          slug: 'shared-slug',
          name: { en: 'Duplicate in Brand A' },
        }),
      )
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(Error);
    const cause = (error as Error).cause as { code?: string; constraint_name?: string } | undefined;
    expect(cause?.code).toBe('23505');
    expect(cause?.constraint_name).toBe('menu_categories_brand_slug_uq');
  });
});
