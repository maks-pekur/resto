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
  console.warn('[analytics-dashboard.e2e] Docker not available — skipping.');
}

const dateKey = (daysAgo: number): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() - daysAgo * 86_400_000));

const LAST_28_DAYS = `?from=${dateKey(27)}&to=${dateKey(0)}`;

interface DashboardKpis {
  range: { from: string; to: string };
  currency: string;
  revenue: { value: string; previous: string };
  completedOrders: { value: number; previous: number };
  newGuests: { value: number; previous: number };
  refunds: { value: string; previous: string };
}

suite('Analytics dashboard e2e', () => {
  let stack: RealStack;
  let tenantId: string;
  let ownerCookie: string;
  let staffCookie: string;
  let scopedAdminCookie: string;
  let locationId: string;
  let emptyLocationId: string;

  const getDashboard = (
    cookie: string,
    headers: Record<string, string> = {},
    query = LAST_28_DAYS,
  ) =>
    stack.app.inject({
      method: 'GET',
      url: `/v1/analytics/dashboard${query}`,
      headers: { cookie, 'x-tenant-id': tenantId, ...headers },
    });

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    stack = await startRealStack({ natsEnabledInApp: false });

    const tenantSlug = `kpi-${randomUUID().slice(0, 8)}`;
    const ownerEmail = `owner-${randomUUID().slice(0, 8)}@example.com`;
    const tenant = await provisionTenant(stack.app, tenantSlug, INTERNAL_TOKEN);
    tenantId = tenant.id;
    await runBootstrap({ tenantSlug, email: ownerEmail, password: PASSWORD, name: 'Owner' });
    ownerCookie = await signInAsOperator(stack.app, ownerEmail, PASSWORD, tenantId);

    const locationRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/tenancy/locations',
      headers: { cookie: ownerCookie, 'x-tenant-id': tenantId },
      payload: {
        name: 'KPI Location',
        address: '1 Test Street, London',
        latitude: 51.5074,
        longitude: -0.1278,
      },
    });
    expect(locationRes.statusCode).toBe(200);
    locationId = locationRes.json<{ id: string }>().id;

    const emptyLocationRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/tenancy/locations',
      headers: { cookie: ownerCookie, 'x-tenant-id': tenantId },
      payload: {
        name: 'KPI Location Without Orders',
        address: '2 Test Street, London',
        latitude: 51.5074,
        longitude: -0.1278,
      },
    });
    expect(emptyLocationRes.statusCode).toBe(200);
    emptyLocationId = emptyLocationRes.json<{ id: string }>().id;

    const db = stack.app.get(TenantAwareDb);
    await db.withoutTenant('seed analytics dashboard orders', async (tx) => {
      await tx.insert(schema.orders).values([
        {
          id: randomUUID(),
          tenantId,
          locationId,
          idempotencyKey: randomUUID(),
          orderNumber: 'K-1',
          status: 'completed',
          orderType: 'dine_in',
          subtotal: '100.00',
          total: '100.00',
          currency: 'GBP',
          shortNumber: 1,
          customerPhone: '+4400000001',
          createdAt: new Date(Date.now() - 86_400_000),
        },
        {
          id: randomUUID(),
          tenantId,
          locationId,
          idempotencyKey: randomUUID(),
          orderNumber: 'K-2',
          status: 'canceled',
          orderType: 'dine_in',
          subtotal: '999.00',
          total: '999.00',
          currency: 'GBP',
          shortNumber: 2,
          customerPhone: '+4400000002',
          createdAt: new Date(Date.now() - 86_400_000),
        },
      ]);
    });

    const staffEmail = `staff-${randomUUID().slice(0, 8)}@example.com`;
    const throwawaySlug = `kpi-staff-${randomUUID().slice(0, 8)}`;
    await provisionTenant(stack.app, throwawaySlug, INTERNAL_TOKEN);
    const staffUser = await runBootstrap({
      tenantSlug: throwawaySlug,
      email: staffEmail,
      password: PASSWORD,
      name: 'Staff',
    });
    const authDb = stack.app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
    await authDb.db.insert(schema.member).values({
      id: randomUUID(),
      tenantId,
      userId: staffUser.userId,
      role: 'staff',
      createdAt: new Date(),
    });
    staffCookie = await signInAsOperator(stack.app, staffEmail, PASSWORD, tenantId);

    const adminEmail = `admin-${randomUUID().slice(0, 8)}@example.com`;
    const adminSlug = `kpi-admin-${randomUUID().slice(0, 8)}`;
    await provisionTenant(stack.app, adminSlug, INTERNAL_TOKEN);
    const adminUser = await runBootstrap({
      tenantSlug: adminSlug,
      email: adminEmail,
      password: PASSWORD,
      name: 'Scoped Admin',
    });
    const adminMemberId = randomUUID();
    await authDb.db.insert(schema.member).values({
      id: adminMemberId,
      tenantId,
      userId: adminUser.userId,
      role: 'admin',
      createdAt: new Date(),
    });
    await db.withoutTenant('seed scoped admin location scope', (tx) =>
      tx
        .insert(schema.memberLocationScope)
        .values({ memberId: adminMemberId, locationId: emptyLocationId, tenantId }),
    );
    scopedAdminCookie = await signInAsOperator(stack.app, adminEmail, PASSWORD, tenantId);
  }, 240_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  it('answers the owner with paid money and completed orders across every location', async () => {
    const res = await getDashboard(ownerCookie);

    expect(res.statusCode).toBe(200);
    const body = res.json<DashboardKpis>();
    expect(body.revenue.value).toBe('100.00');
    expect(body.completedOrders.value).toBe(1);
    expect(body.newGuests.value).toBe(1);
    expect(body.refunds.value).toBe('0.00');
    expect(body.range).toEqual({ from: dateKey(27), to: dateKey(0) });
    expect(body.currency).toBe('GBP');
  });

  it('answers the same numbers for the one location that holds the orders', async () => {
    const res = await getDashboard(ownerCookie, { 'x-location-id': locationId });

    expect(res.statusCode).toBe(200);
    expect(res.json<DashboardKpis>().revenue.value).toBe('100.00');
  });

  it('defaults to today, which the day-old order falls outside of', async () => {
    const res = await getDashboard(ownerCookie, {}, '');

    expect(res.statusCode).toBe(200);
    const body = res.json<DashboardKpis>();
    expect(body.range).toEqual({ from: dateKey(0), to: dateKey(0) });
    expect(body.revenue.value).toBe('0.00');
  });

  it('refuses a half-given range', async () => {
    const res = await getDashboard(ownerCookie, {}, `?from=${dateKey(7)}`);

    expect(res.statusCode).toBe(400);
  });

  it('refuses a range that ends before it starts', async () => {
    const res = await getDashboard(ownerCookie, {}, `?from=${dateKey(0)}&to=${dateKey(7)}`);

    expect(res.statusCode).toBe(400);
  });

  it('refuses a date that is not a date', async () => {
    const res = await getDashboard(ownerCookie, {}, '?from=yesterday&to=today');

    expect(res.statusCode).toBe(400);
  });

  it('refuses a location that belongs to nobody', async () => {
    const res = await getDashboard(ownerCookie, { 'x-location-id': randomUUID() });

    expect(res.statusCode).toBe(404);
  });

  it('refuses a member without reports:read', async () => {
    const res = await getDashboard(staffCookie);

    expect(res.statusCode).toBe(403);
  });

  it('shows a scoped admin only the location they hold', async () => {
    const res = await getDashboard(scopedAdminCookie);

    expect(res.statusCode).toBe(200);
    const body = res.json<DashboardKpis>();
    expect(body.revenue.value).toBe('0.00');
    expect(body.completedOrders.value).toBe(0);
  });

  it('refuses a scoped admin the location they do not hold', async () => {
    const res = await getDashboard(scopedAdminCookie, { 'x-location-id': locationId });

    expect(res.statusCode).toBe(403);
  });
});
