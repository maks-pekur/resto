import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';
import { runInTenantContext, schema } from '../../src/index';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[catalog-menu-versions] Docker not available — skipping integration tests.');
}

suite('catalog version tables', () => {
  let pg: TestPg;
  let tenantA: string;
  let tenantB: string;
  let brandA: string;
  let brandB: string;

  beforeAll(async () => {
    pg = await startPostgres();

    await pg.db.withoutTenant('seed two tenants and brands', async (tx) => {
      const [a] = await tx
        .insert(schema.tenants)
        .values({ slug: 'ver-a', displayName: 'Ver A' })
        .returning({ id: schema.tenants.id });
      const [b] = await tx
        .insert(schema.tenants)
        .values({ slug: 'ver-b', displayName: 'Ver B' })
        .returning({ id: schema.tenants.id });
      if (!a || !b) throw new Error('Failed to seed tenants.');
      tenantA = a.id;
      tenantB = b.id;

      const [ba] = await tx
        .insert(schema.brands)
        .values({ tenantId: tenantA, slug: 'ver-a-brand', displayName: 'Ver A Brand' })
        .returning({ id: schema.brands.id });
      const [bb] = await tx
        .insert(schema.brands)
        .values({ tenantId: tenantB, slug: 'ver-b-brand', displayName: 'Ver B Brand' })
        .returning({ id: schema.brands.id });
      if (!ba || !bb) throw new Error('Failed to seed brands.');
      brandA = ba.id;
      brandB = bb.id;

      await tx
        .insert(schema.catalogMenuVersion)
        .values([{ tenantId: tenantA }, { tenantId: tenantB }])
        .onConflictDoNothing();
      await tx
        .insert(schema.catalogBrandStopVersion)
        .values([
          { brandId: brandA, tenantId: tenantA },
          { brandId: brandB, tenantId: tenantB },
        ])
        .onConflictDoNothing();
    });
  }, 90_000);

  afterAll(async () => {
    await stopPostgres(pg);
  });

  it('seeds a tenant menu_version of 1', async () => {
    const rows = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) =>
        tx
          .select()
          .from(schema.catalogMenuVersion)
          .where(eq(schema.catalogMenuVersion.tenantId, tenantA)),
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.menuVersion).toBe(1);
  });

  it('seeds a brand stop_version of 1', async () => {
    const rows = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) =>
        tx
          .select()
          .from(schema.catalogBrandStopVersion)
          .where(eq(schema.catalogBrandStopVersion.brandId, brandA)),
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.stopVersion).toBe(1);
  });

  it('increments menu_version atomically and returns 2', async () => {
    const bumped = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) =>
        tx.execute<{ menu_version: number }>(
          sql`UPDATE catalog_menu_version SET menu_version = menu_version + 1 WHERE tenant_id = ${tenantA} RETURNING menu_version`,
        ),
      ),
    );
    expect(Number(bumped[0]?.menu_version)).toBe(2);
  });

  it('blocks a cross-tenant read of catalog_brand_stop_version', async () => {
    const fromA = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) =>
        tx
          .select()
          .from(schema.catalogBrandStopVersion)
          .where(eq(schema.catalogBrandStopVersion.brandId, brandB)),
      ),
    );
    expect(fromA).toHaveLength(0);
  });
});
