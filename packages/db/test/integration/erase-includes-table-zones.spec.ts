import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';
import { schema } from '../../src/index';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[erase-includes-table-zones] Docker not available — skipping.');
}

const SALT = 'test-salt-must-be-at-least-32-chars';

suite('tenancy_erase_tenant — wipes table zones and tables (TBL-04a-erasure)', () => {
  let pg: TestPg;
  let tenantId: string;
  let locationId: string;
  let zoneId: string;
  let firstTableId: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await pg.db.withoutTenant('seed table-zones erase fixtures', async (tx) => {
      const [t] = await tx
        .insert(schema.tenants)
        .values({ slug: 'erase-tbl', displayName: 'EraseTbl', country: 'GB' })
        .returning({ id: schema.tenants.id });
      if (!t) throw new Error('seed tenant failed');
      tenantId = t.id;

      const [loc] = await tx
        .insert(schema.locations)
        .values({ tenantId, name: 'EraseTbl Location', slug: 'erasetbl-location' })
        .returning({ id: schema.locations.id });
      if (!loc) throw new Error('seed location failed');
      locationId = loc.id;

      const [zone] = await tx
        .insert(schema.tableZones)
        .values({ tenantId, locationId, name: 'Main Hall' })
        .returning({ id: schema.tableZones.id });
      if (!zone) throw new Error('seed zone failed');
      zoneId = zone.id;

      const [firstTable] = await tx
        .insert(schema.restaurantTables)
        .values({ tenantId, zoneId, locationId, number: '1', ordinal: 1 })
        .returning({ id: schema.restaurantTables.id });
      if (!firstTable) throw new Error('seed first table failed');
      firstTableId = firstTable.id;

      await tx.insert(schema.restaurantTables).values({
        tenantId,
        zoneId,
        locationId,
        number: '2',
        ordinal: 2,
      });

      await tx.insert(schema.orders).values({
        tenantId,
        locationId,
        idempotencyKey: 'erase-tbl-idem',
        orderNumber: '20260829-ETB',
        status: 'created',
        orderType: 'dine_in',
        tableId: firstTableId,
        tableZoneName: 'Main Hall',
        tableNumber: '1',
        subtotal: '10.00',
        total: '11.50',
        currency: 'USD',
        shortNumber: 1,
      });
    });
  }, 90_000);

  afterAll(async () => {
    await stopPostgres(pg);
  });

  it('erases zones, tables, a table-referencing order and the location with zero rows left, without a foreign-key violation', async () => {
    await pg.db.withoutTenant('run erase', async (tx) => {
      await tx.execute(sql`SELECT app_allow_erasure(${tenantId}::uuid)`);
      // The point of this test: this call must not raise foreign_key_violation.
      // restaurant_tables and table_zones are ON DELETE RESTRICT location
      // children; a table left out of the erase function's explicit DELETE
      // list is a hard failure here, not a silent cascade.
      await tx.execute(
        sql`SELECT tenancy_erase_tenant(${tenantId}::uuid, ${SALT}, 'test:erase-includes-table-zones')`,
      );
    });

    await pg.db.withoutTenant('assert table zones and tables wiped', async (tx) => {
      const tables = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.restaurantTables)
        .where(eq(schema.restaurantTables.tenantId, tenantId));
      expect(tables[0]?.n).toBe(0);

      const zones = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.tableZones)
        .where(eq(schema.tableZones.tenantId, tenantId));
      expect(zones[0]?.n).toBe(0);

      const orders = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.orders)
        .where(eq(schema.orders.tenantId, tenantId));
      expect(orders[0]?.n).toBe(0);

      const locations = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.locations)
        .where(eq(schema.locations.tenantId, tenantId));
      expect(locations[0]?.n).toBe(0);
    });
  });

  it('the erase function itself names both restaurant_tables and table_zones — closes the recurring omission class (migrations 0072/0074/0077)', async () => {
    const [row] = await pg.db.withoutTenant('read erase function source', async (tx) =>
      tx.execute<{ def: string }>(
        sql`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'tenancy_erase_tenant'`,
      ),
    );
    if (!row) throw new Error('tenancy_erase_tenant function not found');
    expect(row.def).toContain('DELETE FROM restaurant_tables');
    expect(row.def).toContain('DELETE FROM table_zones');
  });
});
