import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema, TenantAwareDb } from '@resto/db';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { provisionTenant, runBootstrap, signInAsOperator } from './helpers/operator-fixture';

const INTERNAL_TOKEN = 'integration-test-token-1234567890';
const PASSWORD = 'Sup3r-Secret-Pw!';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[table-location-availability.e2e] Docker not available — skipping.');
}

interface AvailabilityBody {
  readonly stoppedItemIds: string[];
}

interface OrderResponseBody {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly status: string;
}

interface TableResolutionBody {
  readonly tableId: string;
  readonly zoneName: string;
  readonly number: string;
}

const expectEtag = (value: string | string[] | undefined): string => {
  expect(typeof value).toBe('string');
  if (typeof value !== 'string') throw new Error('etag header missing');
  return value;
};

/**
 * TBL-13's read half: `GET /v1/menu/availability` answers for the scanned table's location
 * (plan 10.3-12). TBL-13's write half (plan 10.3-09) makes the order derive its own location the
 * same way. This is the one spec that proves both against a REAL two-location database — a
 * mocked `MenuPricingPort` (as `create-order.service.spec.ts` uses) cannot distinguish "answered
 * for the resolved location" from "answered for a hardcoded one" when both happen to agree in the
 * fixture (10.3-09-SUMMARY.md, "Next Phase Readiness").
 */
suite('Table-location availability + order rejection e2e (Plan 10.3-12)', () => {
  let stack: RealStack;
  let tenantId: string;
  let tenantSlug: string;
  let tenantHost: string;
  let ownerCookie: string;
  let locationAId: string;
  let locationBId: string;
  let stoppedItemId: string;
  let otherItemId: string;
  let tableAId: string;
  let tableBId: string;
  let zoneRenameId: string;
  let tableRenameId: string;
  let archivedTableId: string;

  const db = (): TenantAwareDb => stack.app.get(TenantAwareDb);

  const ownerHeaders = (locationId?: string): Record<string, string> => ({
    cookie: ownerCookie,
    'x-tenant-id': tenantId,
    ...(locationId !== undefined ? { 'x-location-id': locationId } : {}),
  });

  const createLocation = async (name: string): Promise<string> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/tenancy/locations',
      headers: ownerHeaders(),
      payload: { name, address: '1 Test Street, London', latitude: 51.5074, longitude: -0.1278 },
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ id: string }>().id;
  };

  const seedZoneWithTable = async (
    locationId: string,
    zoneName: string,
    tableNumber: string,
  ): Promise<{ zoneId: string; tableId: string }> => {
    const zoneId = randomUUID();
    const tableId = randomUUID();
    await db().withoutTenant('seed zone+table for table-location-availability e2e', async (tx) => {
      await tx
        .insert(schema.tableZones)
        .values({ id: zoneId, tenantId, locationId, name: zoneName });
      await tx.insert(schema.restaurantTables).values({
        id: tableId,
        tenantId,
        zoneId,
        locationId,
        number: tableNumber,
        ordinal: 1,
      });
    });
    return { zoneId, tableId };
  };

  const orderPayload = (params: {
    itemId: string;
    tableId?: string;
    fulfillmentMode?: 'dine_in' | 'pickup';
  }): Record<string, unknown> => ({
    items: [{ itemId: params.itemId, sizeId: null, name: 'Test item', modifiers: [], quantity: 1 }],
    fulfillmentMode: params.fulfillmentMode ?? 'dine_in',
    ...(params.tableId !== undefined ? { tableId: params.tableId } : {}),
    ...(params.fulfillmentMode === 'pickup'
      ? { customerName: 'Guest', customerPhone: '+1234567890' }
      : {}),
    idempotencyKey: randomUUID(),
  });

  const postOrder = (payload: Record<string, unknown>) =>
    stack.app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { 'x-tenant-id': tenantId, 'content-type': 'application/json' },
      payload,
    });

  const countOrdersForTenant = async (): Promise<number> => {
    const rows = await db().withoutTenant(
      'count orders for table-location-availability e2e',
      (tx) =>
        tx
          .select({ id: schema.orders.id })
          .from(schema.orders)
          .where(eq(schema.orders.tenantId, tenantId)),
    );
    return rows.length;
  };

  const readOrderRow = async (
    orderId: string,
  ): Promise<
    { locationId: string; tableZoneName: string | null; tableNumber: string | null } | undefined
  > => {
    const rows = await db().withoutTenant(
      'read order row for table-location-availability e2e',
      (tx) =>
        tx
          .select({
            locationId: schema.orders.locationId,
            tableZoneName: schema.orders.tableZoneName,
            tableNumber: schema.orders.tableNumber,
          })
          .from(schema.orders)
          .where(eq(schema.orders.id, orderId)),
    );
    return rows[0];
  };

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    // GuestMenuUrlService throws building a table's qrUrl without this (10.3-07/08 precedent) —
    // this plan's own case 12 renumbers a table through the admin route, which renders one.
    process.env.PUBLIC_APEX_DOMAIN = 'resto.app';
    stack = await startRealStack({ natsEnabledInApp: false });

    tenantSlug = `tbl-avail-${randomUUID().slice(0, 8)}`;
    tenantHost = `${tenantSlug}.menu.resto.app`;
    const ownerEmail = `owner-${randomUUID().slice(0, 8)}@example.com`;
    const tenant = await provisionTenant(stack.app, tenantSlug, INTERNAL_TOKEN);
    tenantId = tenant.id;
    await runBootstrap({ tenantSlug, email: ownerEmail, password: PASSWORD, name: 'Owner' });
    ownerCookie = await signInAsOperator(stack.app, ownerEmail, PASSWORD, tenantId);

    // Created in this order — DefaultLocationResolverService picks the earliest active location,
    // so A is the tenant default throughout this spec (cases 3, 4, 5, 9 lean on that fact).
    locationAId = await createLocation('Location A');
    locationBId = await createLocation('Location B');

    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: ownerHeaders(),
      payload: { slug: 'mains', name: { en: 'Mains' }, sortOrder: 0 },
    });
    expect(categoryRes.statusCode).toBe(200);
    const categoryId = categoryRes.json<{ id: string }>().id;

    const createItem = async (slug: string): Promise<string> => {
      const res = await stack.app.inject({
        method: 'POST',
        url: '/v1/catalog/items',
        headers: ownerHeaders(),
        payload: {
          categoryId,
          slug,
          name: { en: slug },
          basePrice: '9.99',
          currency: 'USD',
          status: 'published',
        },
      });
      expect(res.statusCode).toBe(200);
      return res.json<{ id: string }>().id;
    };
    stoppedItemId = await createItem('stopped-in-b');
    otherItemId = await createItem('always-available');

    const publishRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/publish',
      headers: ownerHeaders(),
    });
    expect(publishRes.statusCode).toBe(200);

    // The real write path (POST /v1/catalog/stop-list under x-location-id: B), not a hand-seeded
    // stop-list row — exercises the same mutation an operator's browser would issue.
    const stopRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/stop-list',
      headers: ownerHeaders(locationBId),
      payload: { itemId: stoppedItemId },
    });
    expect(stopRes.statusCode).toBe(200);

    ({ tableId: tableAId } = await seedZoneWithTable(locationAId, 'Zone A', '1'));
    ({ tableId: tableBId } = await seedZoneWithTable(locationBId, 'Zone B', '1'));
    const renameFixture = await seedZoneWithTable(locationAId, 'Rename Zone Original', '5');
    zoneRenameId = renameFixture.zoneId;
    tableRenameId = renameFixture.tableId;
    const archivedFixture = await seedZoneWithTable(locationAId, 'Archived Zone Target', '9');
    archivedTableId = archivedFixture.tableId;

    const archiveRes = await stack.app.inject({
      method: 'PATCH',
      url: `/v1/tenancy/table-zones/${archivedFixture.zoneId}/tables/${archivedTableId}/archive`,
      headers: ownerHeaders(locationAId),
    });
    expect(archiveRes.statusCode).toBe(200);
  }, 240_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  it('case 1 — ?t=<table in B> reports the item stopped in B', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: `/v1/menu/availability?t=${tableBId}`,
      headers: { host: tenantHost },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<AvailabilityBody>().stoppedItemIds).toContain(stoppedItemId);
  });

  it('case 2 — ?t=<table in A> reports the item NOT stopped', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: `/v1/menu/availability?t=${tableAId}`,
      headers: { host: tenantHost },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<AvailabilityBody>().stoppedItemIds).not.toContain(stoppedItemId);
  });

  it('case 3 — no ?t= answers the default location (A) — every existing caller sees the same thing', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu/availability',
      headers: { host: tenantHost },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<AvailabilityBody>().stoppedItemIds).not.toContain(stoppedItemId);
  });

  it('case 4 — an unresolvable ?t= (random uuid) returns 200 with the default answer, not a 4xx', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: `/v1/menu/availability?t=${randomUUID()}`,
      headers: { host: tenantHost },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<AvailabilityBody>().stoppedItemIds).not.toContain(stoppedItemId);
  });

  it('case 5 — a malformed non-uuid ?t= likewise returns 200 with the default answer', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu/availability?t=not-a-uuid',
      headers: { host: tenantHost },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<AvailabilityBody>().stoppedItemIds).not.toContain(stoppedItemId);
  });

  it('case 6 — the ETags for table B and table A differ, so a CDN cannot reuse one for the other', async () => {
    const resB = await stack.app.inject({
      method: 'GET',
      url: `/v1/menu/availability?t=${tableBId}`,
      headers: { host: tenantHost },
    });
    const resA = await stack.app.inject({
      method: 'GET',
      url: `/v1/menu/availability?t=${tableAId}`,
      headers: { host: tenantHost },
    });
    expect(expectEtag(resB.headers.etag)).not.toBe(expectEtag(resA.headers.etag));
  });

  it('case 7 — a dine_in order from table B for the stopped item is rejected as unavailable, and writes no orders row', async () => {
    const before = await countOrdersForTenant();
    expect(before).toBe(0);

    const res = await postOrder(orderPayload({ tableId: tableBId, itemId: stoppedItemId }));
    expect(res.statusCode).toBe(422);
    expect(res.json<{ code?: string }>().code).toBe('ordering.item_unavailable');
    expect(await countOrdersForTenant()).toBe(0);
  });

  it('case 8 — the same order from table A succeeds and is stored with location_id = A', async () => {
    const res = await postOrder(orderPayload({ tableId: tableAId, itemId: stoppedItemId }));
    expect(res.statusCode).toBe(201);
    const orderId = res.json<OrderResponseBody>().orderId;
    const row = await readOrderRow(orderId);
    expect(row?.locationId).toBe(locationAId);
  });

  it('case 9 — a pickup order with no table still lands on the default location', async () => {
    const res = await postOrder(orderPayload({ itemId: otherItemId, fulfillmentMode: 'pickup' }));
    expect(res.statusCode).toBe(201);
    const orderId = res.json<OrderResponseBody>().orderId;
    const row = await readOrderRow(orderId);
    expect(row?.locationId).toBe(locationAId);
  });

  it('case 10 — an unresolvable or archived table id refuses the order at the HTTP layer and writes nothing new', async () => {
    const beforeUnknown = await countOrdersForTenant();
    const unknownRes = await postOrder(
      orderPayload({ tableId: randomUUID(), itemId: otherItemId }),
    );
    expect(unknownRes.statusCode).toBe(400);
    expect(unknownRes.json<{ code?: string }>().code).toBe('ordering.table_not_resolved');
    expect(await countOrdersForTenant()).toBe(beforeUnknown);

    const beforeArchived = await countOrdersForTenant();
    const archivedRes = await postOrder(
      orderPayload({ tableId: archivedTableId, itemId: otherItemId }),
    );
    expect(archivedRes.statusCode).toBe(400);
    expect(archivedRes.json<{ code?: string }>().code).toBe('ordering.table_not_resolved');
    expect(await countOrdersForTenant()).toBe(beforeArchived);
  });

  it('case 11 — a stray x-location-id changes neither the availability answer nor the table resolution', async () => {
    const plain = await stack.app.inject({
      method: 'GET',
      url: `/v1/menu/availability?t=${tableBId}`,
      headers: { host: tenantHost },
    });
    expect(plain.json<AvailabilityBody>().stoppedItemIds).toContain(stoppedItemId);

    const strayHeader = await stack.app.inject({
      method: 'GET',
      url: `/v1/menu/availability?t=${tableBId}`,
      headers: { host: tenantHost, 'x-location-id': locationAId },
    });
    expect(strayHeader.statusCode).toBe(200);
    expect(strayHeader.json<AvailabilityBody>()).toEqual(plain.json<AvailabilityBody>());
    expect(strayHeader.headers.etag).toBe(plain.headers.etag);

    const plainResolve = await stack.app.inject({
      method: 'GET',
      url: `/v1/tables/${tableBId}`,
      headers: { host: tenantHost },
    });
    const strayResolve = await stack.app.inject({
      method: 'GET',
      url: `/v1/tables/${tableBId}`,
      headers: { host: tenantHost, 'x-location-id': locationAId },
    });
    expect(strayResolve.statusCode).toBe(200);
    expect(strayResolve.json<TableResolutionBody>()).toEqual(
      plainResolve.json<TableResolutionBody>(),
    );
  });

  it('case 12 — a rename/renumber after order creation freezes the snapshot but the live resolution route reflects the new values', async () => {
    const res = await postOrder(orderPayload({ tableId: tableRenameId, itemId: otherItemId }));
    expect(res.statusCode).toBe(201);
    const orderId = res.json<OrderResponseBody>().orderId;

    const frozenRow = await readOrderRow(orderId);
    expect(frozenRow?.tableZoneName).toBe('Rename Zone Original');
    expect(frozenRow?.tableNumber).toBe('5');

    const renameRes = await stack.app.inject({
      method: 'PATCH',
      url: `/v1/tenancy/table-zones/${zoneRenameId}`,
      headers: ownerHeaders(locationAId),
      payload: { name: 'Rename Zone Renamed' },
    });
    expect(renameRes.statusCode).toBe(200);

    const renumberRes = await stack.app.inject({
      method: 'PATCH',
      url: `/v1/tenancy/table-zones/${zoneRenameId}/tables/${tableRenameId}`,
      headers: ownerHeaders(locationAId),
      payload: { number: '55' },
    });
    expect(renumberRes.statusCode).toBe(200);

    const afterRow = await readOrderRow(orderId);
    expect(afterRow?.tableZoneName).toBe('Rename Zone Original');
    expect(afterRow?.tableNumber).toBe('5');

    const liveRes = await stack.app.inject({
      method: 'GET',
      url: `/v1/tables/${tableRenameId}`,
      headers: { host: tenantHost },
    });
    expect(liveRes.statusCode).toBe(200);
    const liveBody = liveRes.json<TableResolutionBody>();
    expect(liveBody.zoneName).toBe('Rename Zone Renamed');
    expect(liveBody.number).toBe('55');
  });
});
