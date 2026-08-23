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
  let locationA: string;
  let locationB: string;

  beforeAll(async () => {
    pg = await startPostgres();

    await pg.db.withoutTenant('seed two tenants and locations', async (tx) => {
      const [a] = await tx
        .insert(schema.tenants)
        .values({ slug: 'ver-a', displayName: 'Ver A', country: 'GB' })
        .returning({ id: schema.tenants.id });
      const [b] = await tx
        .insert(schema.tenants)
        .values({ slug: 'ver-b', displayName: 'Ver B', country: 'GB' })
        .returning({ id: schema.tenants.id });
      if (!a || !b) throw new Error('Failed to seed tenants.');
      tenantA = a.id;
      tenantB = b.id;

      const [la] = await tx
        .insert(schema.locations)
        .values({ tenantId: tenantA, name: 'Ver A Location' })
        .returning({ id: schema.locations.id });
      const [lb] = await tx
        .insert(schema.locations)
        .values({ tenantId: tenantB, name: 'Ver B Location' })
        .returning({ id: schema.locations.id });
      if (!la || !lb) throw new Error('Failed to seed locations.');
      locationA = la.id;
      locationB = lb.id;

      await tx
        .insert(schema.catalogMenuVersion)
        .values([{ tenantId: tenantA }, { tenantId: tenantB }])
        .onConflictDoNothing();
      await tx
        .insert(schema.catalogLocationStopVersion)
        .values([
          { locationId: locationA, tenantId: tenantA },
          { locationId: locationB, tenantId: tenantB },
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

  it('seeds a location stop_version of 1', async () => {
    const rows = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) =>
        tx
          .select()
          .from(schema.catalogLocationStopVersion)
          .where(eq(schema.catalogLocationStopVersion.locationId, locationA)),
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

  it('blocks a cross-tenant read of catalog_location_stop_version', async () => {
    const fromA = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) =>
        tx
          .select()
          .from(schema.catalogLocationStopVersion)
          .where(eq(schema.catalogLocationStopVersion.locationId, locationB)),
      ),
    );
    expect(fromA).toHaveLength(0);
  });
});
