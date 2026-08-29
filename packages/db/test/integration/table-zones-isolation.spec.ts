import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';
import { runInTenantContext, schema } from '../../src/index';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[table-zones-isolation] Docker not available — skipping.');
}

suite('table_zones / restaurant_tables — RLS, composite FKs and the partial unique index', () => {
  let pg: TestPg;
  let tenantA: string;
  let tenantB: string;
  let aLocation1Id: string; // tenant A, location 1 ("A1")
  let aLocation2Id: string; // tenant A, location 2 ("A2") — exercises the location dimension within one tenant
  let bLocation1Id: string; // tenant B, its own location
  let aZone1Id: string; // zone on A1, holds tables '1' and '2'
  let aZone2Id: string; // zone on A2, holds table '1'
  let aZone1Table1Id: string; // the table numbered '1' in zone A1 — target of the archive-then-reuse case
  let aZone2Table1Id: string; // the table numbered '1' in zone A2 — proves the same number across zones is fine

  beforeAll(async () => {
    pg = await startPostgres();
    await pg.db.withoutTenant('seed table-zones isolation fixtures', async (tx) => {
      const [a] = await tx
        .insert(schema.tenants)
        .values({ slug: 'tbl-iso-a', displayName: 'TblIsoA', country: 'GB' })
        .returning({ id: schema.tenants.id });
      const [b] = await tx
        .insert(schema.tenants)
        .values({ slug: 'tbl-iso-b', displayName: 'TblIsoB', country: 'GB' })
        .returning({ id: schema.tenants.id });
      if (!a || !b) throw new Error('seed tenants failed');
      tenantA = a.id;
      tenantB = b.id;

      const [aLoc1] = await tx
        .insert(schema.locations)
        .values({ tenantId: tenantA, name: 'A1', slug: 'tbl-iso-a1' })
        .returning({ id: schema.locations.id });
      const [aLoc2] = await tx
        .insert(schema.locations)
        .values({ tenantId: tenantA, name: 'A2', slug: 'tbl-iso-a2' })
        .returning({ id: schema.locations.id });
      const [bLoc1] = await tx
        .insert(schema.locations)
        .values({ tenantId: tenantB, name: 'B1', slug: 'tbl-iso-b1' })
        .returning({ id: schema.locations.id });
      if (!aLoc1 || !aLoc2 || !bLoc1) throw new Error('seed locations failed');
      aLocation1Id = aLoc1.id;
      aLocation2Id = aLoc2.id;
      bLocation1Id = bLoc1.id;

      const [zone1] = await tx
        .insert(schema.tableZones)
        .values({ tenantId: tenantA, locationId: aLocation1Id, name: 'A1 Zone' })
        .returning({ id: schema.tableZones.id });
      const [zone2] = await tx
        .insert(schema.tableZones)
        .values({ tenantId: tenantA, locationId: aLocation2Id, name: 'A2 Zone' })
        .returning({ id: schema.tableZones.id });
      if (!zone1 || !zone2) throw new Error('seed zones failed');
      aZone1Id = zone1.id;
      aZone2Id = zone2.id;

      const [z1t1] = await tx
        .insert(schema.restaurantTables)
        .values({
          tenantId: tenantA,
          zoneId: aZone1Id,
          locationId: aLocation1Id,
          number: '1',
          ordinal: 1,
        })
        .returning({ id: schema.restaurantTables.id });
      if (!z1t1) throw new Error('seed A1 zone table 1 failed');
      aZone1Table1Id = z1t1.id;

      await tx.insert(schema.restaurantTables).values({
        tenantId: tenantA,
        zoneId: aZone1Id,
        locationId: aLocation1Id,
        number: '2',
        ordinal: 2,
      });

      const [z2t1] = await tx
        .insert(schema.restaurantTables)
        .values({
          tenantId: tenantA,
          zoneId: aZone2Id,
          locationId: aLocation2Id,
          number: '1',
          ordinal: 1,
        })
        .returning({ id: schema.restaurantTables.id });
      if (!z2t1) throw new Error('seed A2 zone table 1 failed');
      aZone2Table1Id = z2t1.id;
    });
  }, 90_000);

  afterAll(async () => {
    await stopPostgres(pg);
  });

  it('1. tenant isolation: a tenant-B read returns zero table_zones and zero restaurant_tables rows', async () => {
    const zonesFromB = await runInTenantContext({ tenantId: tenantB }, () =>
      pg.db.withTenant(async (tx) => tx.select().from(schema.tableZones)),
    );
    expect(zonesFromB).toHaveLength(0);

    const tablesFromB = await runInTenantContext({ tenantId: tenantB }, () =>
      pg.db.withTenant(async (tx) => tx.select().from(schema.restaurantTables)),
    );
    expect(tablesFromB).toHaveLength(0);
  });

  it("2. composite FK, zone → location: a tenant-B insert carrying tenant A's location_id is rejected", async () => {
    const error = await runInTenantContext({ tenantId: tenantB }, () =>
      pg.db.withTenant(async (tx) =>
        tx.insert(schema.tableZones).values({
          tenantId: tenantB,
          locationId: aLocation1Id,
          name: 'Cross-tenant zone attempt',
        }),
      ),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
  });

  it("3. composite FK, table → zone: a tenant-B insert carrying tenant A's zone_id is rejected", async () => {
    const error = await runInTenantContext({ tenantId: tenantB }, () =>
      pg.db.withTenant(async (tx) =>
        tx.insert(schema.restaurantTables).values({
          tenantId: tenantB,
          zoneId: aZone1Id,
          locationId: bLocation1Id,
          number: '99',
          ordinal: 99,
        }),
      ),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
  });

  it('4. RESTRICTIVE location policy on table_zones: a read bound to A1 contains the A1 zone and not the A2 zone, and the mirror bound to A2 is the inverse', async () => {
    const boundToA1 = await runInTenantContext(
      { tenantId: tenantA, locationId: aLocation1Id },
      () => pg.db.withTenant(async (tx) => tx.select().from(schema.tableZones)),
    );
    expect(boundToA1.map((z) => z.id)).toContain(aZone1Id);
    expect(boundToA1.map((z) => z.id)).not.toContain(aZone2Id);

    const boundToA2 = await runInTenantContext(
      { tenantId: tenantA, locationId: aLocation2Id },
      () => pg.db.withTenant(async (tx) => tx.select().from(schema.tableZones)),
    );
    expect(boundToA2.map((z) => z.id)).toContain(aZone2Id);
    expect(boundToA2.map((z) => z.id)).not.toContain(aZone1Id);
  });

  it('5. RESTRICTIVE location policy on restaurant_tables: a read bound to A1 contains A1 zone tables and not the A2 zone table, and the mirror bound to A2 is the inverse', async () => {
    const boundToA1 = await runInTenantContext(
      { tenantId: tenantA, locationId: aLocation1Id },
      () => pg.db.withTenant(async (tx) => tx.select().from(schema.restaurantTables)),
    );
    expect(boundToA1.map((t) => t.id)).toContain(aZone1Table1Id);
    expect(boundToA1.map((t) => t.id)).not.toContain(aZone2Table1Id);

    const boundToA2 = await runInTenantContext(
      { tenantId: tenantA, locationId: aLocation2Id },
      () => pg.db.withTenant(async (tx) => tx.select().from(schema.restaurantTables)),
    );
    expect(boundToA2.map((t) => t.id)).toContain(aZone2Table1Id);
    expect(boundToA2.map((t) => t.id)).not.toContain(aZone1Table1Id);
  });

  it('6. RESTRICTIVE WITH CHECK: an insert of a table_zones row whose location_id is A2 while the session is bound to A1 is rejected', async () => {
    const error = await runInTenantContext({ tenantId: tenantA, locationId: aLocation1Id }, () =>
      pg.db.withTenant(async (tx) =>
        tx.insert(schema.tableZones).values({
          tenantId: tenantA,
          locationId: aLocation2Id,
          name: 'Rejected via A1 session',
        }),
      ),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
  });

  it('7. partial unique index: active-number uniqueness holds per zone, a second active table numbered 1 in a sibling zone is fine, and archiving frees the number for reuse', async () => {
    const duplicateInSameZone = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) =>
        tx.insert(schema.restaurantTables).values({
          tenantId: tenantA,
          zoneId: aZone1Id,
          locationId: aLocation1Id,
          number: '1',
          ordinal: 3,
        }),
      ),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(duplicateInSameZone).toBeInstanceOf(Error);

    const zone2Table1 = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) =>
        tx
          .select()
          .from(schema.restaurantTables)
          .where(eq(schema.restaurantTables.id, aZone2Table1Id)),
      ),
    );
    expect(zone2Table1).toHaveLength(1);
    expect(zone2Table1[0]?.number).toBe('1');

    await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) =>
        tx
          .update(schema.restaurantTables)
          .set({ status: 'archived' })
          .where(eq(schema.restaurantTables.id, aZone1Table1Id)),
      ),
    );

    const reusedAfterArchive = await runInTenantContext({ tenantId: tenantA }, () =>
      pg.db.withTenant(async (tx) =>
        tx.insert(schema.restaurantTables).values({
          tenantId: tenantA,
          zoneId: aZone1Id,
          locationId: aLocation1Id,
          number: '1',
          ordinal: 4,
        }),
      ),
    ).then(
      () => 'ok',
      (e: unknown) => e,
    );
    expect(reusedAfterArchive).toBe('ok');
  });

  it('8. no hard deletes: resto_app has no DELETE privilege on table_zones or restaurant_tables', async () => {
    const [zonesPriv] = await pg.db.withoutTenant(
      'check table_zones DELETE privilege',
      async (tx) =>
        tx.execute<{ has_priv: boolean }>(
          sql`SELECT has_table_privilege('resto_app', 'public.table_zones', 'DELETE') AS has_priv`,
        ),
    );
    expect(zonesPriv?.has_priv).toBe(false);

    const [tablesPriv] = await pg.db.withoutTenant(
      'check restaurant_tables DELETE privilege',
      async (tx) =>
        tx.execute<{ has_priv: boolean }>(
          sql`SELECT has_table_privilege('resto_app', 'public.restaurant_tables', 'DELETE') AS has_priv`,
        ),
    );
    expect(tablesPriv?.has_priv).toBe(false);
  });
});
