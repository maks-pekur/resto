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
import { provisionTenant, runBootstrap, signInAsOperator } from './helpers/operator-fixture';
import { AUTH_DRIZZLE_TOKEN } from '../../src/contexts/identity/identity.tokens';
import type { AuthDrizzle } from '../../src/contexts/identity/infrastructure/better-auth/auth-db';

const INTERNAL_TOKEN = 'integration-test-token-1234567890';
const PASSWORD = 'Sup3r-Secret-Pw!';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[stop-list-aggregate.e2e] Docker not available — skipping.');
}

interface AggregateStopListItem {
  itemId: string;
  itemName: Record<string, string> | null;
  categoryName: Record<string, string> | null;
  stoppedLocationCount: number;
  lastStoppedAt: string;
}

suite('Stop-list aggregate e2e (Plan 08.5-03: BLOCK-1 D-09, D-06, D-10, D-16)', () => {
  let stack: RealStack;
  let tenantId: string;
  let ownerCookie: string;
  let locationAId: string;
  let locationBId: string;
  let locationDId: string;
  let foreignTenantLocationId: string;
  let itemId: string;
  let nonOwnerCookie: string;

  const createLocation = async (name: string): Promise<string> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/tenancy/locations',
      headers: { cookie: ownerCookie, 'x-tenant-id': tenantId },
      payload: {
        name,
        address: '1 Test Street, London',
        latitude: 51.5074,
        longitude: -0.1278,
      },
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ id: string }>().id;
  };

  const archiveLocation = async (locationId: string): Promise<void> => {
    const res = await stack.app.inject({
      method: 'PATCH',
      url: `/v1/tenancy/locations/${locationId}/archive`,
      headers: { cookie: ownerCookie, 'x-tenant-id': tenantId },
    });
    expect(res.statusCode).toBe(200);
  };

  const stopItemAt = async (locationId: string, id: string): Promise<void> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/stop-list',
      headers: {
        cookie: ownerCookie,
        'x-tenant-id': tenantId,
        'x-location-id': locationId,
      },
      payload: { itemId: id, reason: '86' },
    });
    expect(res.statusCode).toBe(200);
  };

  const getAggregate = (cookie: string) =>
    stack.app.inject({
      method: 'GET',
      url: '/v1/catalog/stop-list/aggregate',
      headers: { cookie, 'x-tenant-id': tenantId },
    });

  const getStopList = (cookie: string, locationId: string) =>
    stack.app.inject({
      method: 'GET',
      url: '/v1/catalog/stop-list',
      headers: {
        cookie,
        'x-tenant-id': tenantId,
        'x-location-id': locationId,
      },
    });

  const seedScopedAdmin = async (email: string, locationId: string): Promise<string> => {
    const throwawaySlug = `agg-member-${randomUUID().slice(0, 8)}`;
    await provisionTenant(stack.app, throwawaySlug, INTERNAL_TOKEN);
    const user = await runBootstrap({
      tenantSlug: throwawaySlug,
      email,
      password: PASSWORD,
      name: 'Scoped Admin',
    });
    const authDb = stack.app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
    const memberId = randomUUID();
    await authDb.db.insert(schema.member).values({
      id: memberId,
      tenantId,
      userId: user.userId,
      role: 'admin',
      createdAt: new Date(),
    });
    const db = stack.app.get(TenantAwareDb);
    await db.withoutTenant('seed member location scope', (tx) =>
      tx.insert(schema.memberLocationScope).values({ memberId, locationId, tenantId }),
    );
    return signInAsOperator(stack.app, email, PASSWORD, tenantId);
  };

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    stack = await startRealStack({ natsEnabledInApp: false });

    const tenantSlug = `agg-${randomUUID().slice(0, 8)}`;
    const ownerEmail = `owner-${randomUUID().slice(0, 8)}@example.com`;
    const tenant = await provisionTenant(stack.app, tenantSlug, INTERNAL_TOKEN);
    tenantId = tenant.id;
    await runBootstrap({ tenantSlug, email: ownerEmail, password: PASSWORD, name: 'Owner' });
    ownerCookie = await signInAsOperator(stack.app, ownerEmail, PASSWORD, tenantId);

    locationAId = await createLocation('Location A');
    locationBId = await createLocation('Location B');
    locationDId = await createLocation('Location D (to archive)');

    const foreignTenantSlug = `agg-foreign-${randomUUID().slice(0, 8)}`;
    const foreignTenant = await provisionTenant(stack.app, foreignTenantSlug, INTERNAL_TOKEN);
    const db = stack.app.get(TenantAwareDb);
    const [foreignLocation] = await db.withoutTenant('seed foreign-tenant location', (tx) =>
      tx
        .insert(schema.locations)
        .values({
          tenantId: foreignTenant.id,
          name: 'Foreign Tenant Location',
          slug: 'foreign-tenant-location',
        })
        .returning({ id: schema.locations.id }),
    );
    if (!foreignLocation) throw new Error('seed foreign-tenant location failed');
    foreignTenantLocationId = foreignLocation.id;

    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: { cookie: ownerCookie, 'x-tenant-id': tenantId },
      payload: { slug: 'agg-cat', name: { en: 'Aggregate Category' }, sortOrder: 0 },
    });
    expect(categoryRes.statusCode).toBe(200);
    const categoryId = categoryRes.json<{ id: string }>().id;

    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: { cookie: ownerCookie, 'x-tenant-id': tenantId },
      payload: {
        categoryId,
        slug: 'agg-item',
        name: { en: 'Aggregate Item' },
        basePrice: '9.00',
        currency: 'USD',
        status: 'published',
      },
    });
    expect(itemRes.statusCode).toBe(200);
    itemId = itemRes.json<{ id: string }>().id;

    // Stopped at both active locations (A, B) — expected stoppedLocationCount === 2.
    await stopItemAt(locationAId, itemId);
    await stopItemAt(locationBId, itemId);
    // Stopped at D too, then D is archived — this stop must not count toward N or M (D-06).
    await stopItemAt(locationDId, itemId);
    await archiveLocation(locationDId);

    const nonOwnerEmail = `admin-${randomUUID().slice(0, 8)}@example.com`;
    nonOwnerCookie = await seedScopedAdmin(nonOwnerEmail, locationAId);
  }, 240_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  describe('BLOCK-1 / D-09 — non-owner cannot reach the aggregate', () => {
    it('non-owner scoped to location A gets 404 with no other-location data', async () => {
      const res = await getAggregate(nonOwnerCookie);
      expect(res.statusCode).toBe(404);
      const body = res.json<Record<string, unknown>>();
      expect(body.items).toBeUndefined();
      expect(res.body).not.toContain(locationBId);
      expect(res.body).not.toContain('Aggregate Item');
    });
  });

  describe('D-06 — owner all-mode aggregate: N/M semantics', () => {
    it('owner GET aggregate returns 200 with totalActiveLocations excluding the archived location', async () => {
      const res = await getAggregate(ownerCookie);
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        items: AggregateStopListItem[];
        totalActiveLocations: number;
        totalStoppedItems: number;
      }>();
      expect(body.totalActiveLocations).toBe(2);
      const entry = body.items.find((i) => i.itemId === itemId);
      expect(entry).toBeDefined();
      expect(entry?.stoppedLocationCount).toBe(2);
    });
  });

  describe('WR-01 — totalStoppedItems reflects the true distinct-item total, not the page size', () => {
    it('totalStoppedItems equals the distinct stopped-item count across active locations', async () => {
      const res = await getAggregate(ownerCookie);
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: AggregateStopListItem[]; totalStoppedItems: number }>();
      expect(body.totalStoppedItems).toBe(body.items.length);
      expect(body.totalStoppedItems).toBe(1);
    });
  });

  describe('D-16 — aggregate is off the edge cache', () => {
    it('aggregate response carries Cache-Control: private, no-store and no Set-Cookie', async () => {
      const res = await getAggregate(ownerCookie);
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('D-10 — owner single-location read is server-validated against the active tenant', () => {
    it('foreign-tenant location -> 404 (existence-hiding)', async () => {
      const res = await getStopList(ownerCookie, foreignTenantLocationId);
      expect(res.statusCode).toBe(404);
    });

    it('archived location -> 404 (existence-hiding)', async () => {
      const res = await getStopList(ownerCookie, locationDId);
      expect(res.statusCode).toBe(404);
    });

    it('in-tenant active location -> 200', async () => {
      const res = await getStopList(ownerCookie, locationAId);
      expect(res.statusCode).toBe(200);
    });
  });
});
