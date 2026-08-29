import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema, TenantAwareDb } from '@resto/db';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[public-table-resolution.e2e] Docker not available — skipping.');
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

// CONTEXT D-28: the only automated proof that the URL printed on furniture resolves to anything.
suite('GET /v1/tables/:id — public table resolution (Plan 10.3-08)', () => {
  let stack: RealStack;

  let tenantAHost: string;
  let tableId: string;
  let archivedTableId: string;
  let tableInArchivedZoneId: string;
  let tenantBHost: string;
  let tenantBLocationId: string;

  beforeAll(async () => {
    stack = await startRealStack({ natsEnabledInApp: false });
    const db = stack.app.get(TenantAwareDb);

    const tenantAId = randomUUID();
    const tenantASlug = `pub-tbl-a-${randomUUID().slice(0, 8)}`;
    tenantAHost = `${tenantASlug}.menu.resto.app`;
    const locationAId = randomUUID();
    const zoneMainId = randomUUID();
    const zoneArchivedId = randomUUID();
    tableId = randomUUID();
    archivedTableId = randomUUID();
    tableInArchivedZoneId = randomUUID();

    const tenantBId = randomUUID();
    const tenantBSlug = `pub-tbl-b-${randomUUID().slice(0, 8)}`;
    tenantBHost = `${tenantBSlug}.menu.resto.app`;
    tenantBLocationId = randomUUID();

    await db.withoutTenant(
      'seed two tenants + zones + tables directly for public-table-resolution e2e',
      async (tx) => {
        await tx.insert(schema.tenants).values([
          {
            id: tenantAId,
            slug: tenantASlug,
            displayName: 'Public Table Resolution Tenant A',
            locale: 'en',
            country: 'GB',
            defaultCurrency: 'USD',
          },
          {
            id: tenantBId,
            slug: tenantBSlug,
            displayName: 'Public Table Resolution Tenant B',
            locale: 'en',
            country: 'GB',
            defaultCurrency: 'USD',
          },
        ]);
        await tx.insert(schema.tenantDomains).values([
          { tenantId: tenantAId, domain: tenantAHost, kind: 'subdomain', isPrimary: true },
          { tenantId: tenantBId, domain: tenantBHost, kind: 'subdomain', isPrimary: true },
        ]);
        await tx.insert(schema.locations).values([
          {
            id: locationAId,
            tenantId: tenantAId,
            name: 'Location A',
            slug: 'location-a',
            address: '1 Test Street, London',
            latitude: '51.5074',
            longitude: '-0.1278',
          },
          {
            id: tenantBLocationId,
            tenantId: tenantBId,
            name: 'Location B',
            slug: 'location-b',
            address: '2 Test Street, London',
            latitude: '51.5074',
            longitude: '-0.1278',
          },
        ]);
        await tx.insert(schema.tableZones).values([
          { id: zoneMainId, tenantId: tenantAId, locationId: locationAId, name: 'Зал 1' },
          {
            id: zoneArchivedId,
            tenantId: tenantAId,
            locationId: locationAId,
            name: 'Archived Zone',
            status: 'archived',
            archivedAt: new Date(),
          },
        ]);
        await tx.insert(schema.restaurantTables).values([
          {
            id: tableId,
            tenantId: tenantAId,
            zoneId: zoneMainId,
            locationId: locationAId,
            number: '14',
            ordinal: 1,
          },
          {
            id: archivedTableId,
            tenantId: tenantAId,
            zoneId: zoneMainId,
            locationId: locationAId,
            number: '99',
            ordinal: 2,
            status: 'archived',
            archivedAt: new Date(),
          },
          {
            id: tableInArchivedZoneId,
            tenantId: tenantAId,
            zoneId: zoneArchivedId,
            locationId: locationAId,
            number: '1',
            ordinal: 1,
          },
        ]);
      },
    );
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  it('case 1 — a valid id on the tenant guest host resolves the zone name and number, with exactly the three expected keys', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: `/v1/tables/${tableId}`,
      headers: { host: tenantAHost },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<TableResolutionBody>();
    expect(body).toEqual({ tableId, zoneName: 'Зал 1', number: '14' });
    expect(Object.keys(body).sort()).toEqual(['number', 'tableId', 'zoneName']);
  });

  it('case 2 — carries the edge cache headers and a real ETag, and honours if-none-match with a 304', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: `/v1/tables/${tableId}`,
      headers: { host: tenantAHost },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, s-maxage=60, stale-while-revalidate=300');
    const etag = expectEtag(res.headers.etag);

    const notModified = await stack.app.inject({
      method: 'GET',
      url: `/v1/tables/${tableId}`,
      headers: { host: tenantAHost, 'if-none-match': etag },
    });
    expect(notModified.statusCode).toBe(304);
    expect(notModified.body).toBe('');
  });

  it('case 3 — a random UUID returns 404', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: `/v1/tables/${randomUUID()}`,
      headers: { host: tenantAHost },
    });
    expect(res.statusCode).toBe(404);
  });

  it('case 4 — a non-UUID string returns 404, not a 400 or a 500', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/tables/not-a-uuid',
      headers: { host: tenantAHost },
    });
    expect(res.statusCode).toBe(404);
  });

  it('case 5 — an archived table returns 404', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: `/v1/tables/${archivedTableId}`,
      headers: { host: tenantAHost },
    });
    expect(res.statusCode).toBe(404);
  });

  it('case 6 — a table whose zone is archived returns 404, even though the table row itself is active', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: `/v1/tables/${tableInArchivedZoneId}`,
      headers: { host: tenantAHost },
    });
    expect(res.statusCode).toBe(404);
  });

  it("case 7 — tenant A's table id requested on tenant B's guest host returns 404", async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: `/v1/tables/${tableId}`,
      headers: { host: tenantBHost },
    });
    expect(res.statusCode).toBe(404);
  });

  it('case 8 — a request with no recognisable guest host returns 404, not location.context_required (proves @LocationNeutral() is present)', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: `/v1/tables/${tableId}`,
      headers: { host: 'no-such-tenant.menu.resto.app' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ code?: string }>().code).not.toBe('location.context_required');
  });

  it("case 9 — a stray x-location-id from a different tenant's location changes nothing (withoutLocation frame, plan 10.3-05)", async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: `/v1/tables/${tableId}`,
      headers: { host: tenantAHost, 'x-location-id': tenantBLocationId },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<TableResolutionBody>();
    expect(body).toEqual({ tableId, zoneName: 'Зал 1', number: '14' });
  });
});
