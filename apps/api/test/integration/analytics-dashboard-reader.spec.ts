import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runInTenantContext, schema } from '@resto/db';
import { TenantId } from '@resto/domain';
import {
  isDockerAvailable,
  startDbStack,
  stopDbStack,
  type DbStack,
} from '../e2e/helpers/with-db-stack';
import { AnalyticsDrizzleReader } from '../../src/contexts/analytics/infrastructure/analytics-drizzle.reader';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[analytics-dashboard-reader] Docker not available — skipping.');
}

const DAY_MS = 86_400_000;
const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);

suite('AnalyticsDrizzleReader', () => {
  let stack: DbStack;
  let reader: AnalyticsDrizzleReader;

  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const locationA = randomUUID();
  const locationB = randomUUID();
  const otherLocation = randomUUID();

  const paidOrder = randomUUID();
  const from = daysAgo(28);
  const to = new Date(Date.now() + DAY_MS);

  const order = (input: {
    id: string;
    tenantId: string;
    locationId: string;
    status: string;
    total: string;
    createdAt: Date;
    customerPhone?: string | null;
    shortNumber: number;
  }) => ({
    id: input.id,
    tenantId: input.tenantId,
    locationId: input.locationId,
    idempotencyKey: input.id,
    orderNumber: `A-${String(input.shortNumber)}`,
    status: input.status,
    fulfillmentMode: 'dine_in',
    subtotal: input.total,
    total: input.total,
    currency: 'EUR',
    shortNumber: input.shortNumber,
    customerPhone: input.customerPhone ?? null,
    createdAt: input.createdAt,
  });

  beforeAll(async () => {
    stack = await startDbStack();
    reader = new AnalyticsDrizzleReader(stack.db);

    await stack.db.withoutTenant('seed analytics reader fixtures', async (tx) => {
      await tx.insert(schema.tenants).values([
        {
          id: tenantId,
          slug: 'an-tenant',
          displayName: 'Analytics Tenant',
          locale: 'en',
          country: 'GB',
          defaultCurrency: 'EUR',
        },
        {
          id: otherTenantId,
          slug: 'an-other',
          displayName: 'Other Tenant',
          locale: 'en',
          country: 'GB',
          defaultCurrency: 'EUR',
        },
      ]);
      await tx.insert(schema.locations).values([
        { id: locationA, tenantId, name: 'A', slug: 'a' },
        { id: locationB, tenantId, name: 'B', slug: 'b' },
        { id: otherLocation, tenantId: otherTenantId, name: 'C', slug: 'c' },
      ]);
      await tx.insert(schema.orders).values([
        order({
          id: paidOrder,
          tenantId,
          locationId: locationA,
          status: 'completed',
          total: '100.00',
          createdAt: daysAgo(1),
          customerPhone: '+100',
          shortNumber: 1,
        }),
        order({
          id: randomUUID(),
          tenantId,
          locationId: locationA,
          status: 'paid',
          total: '50.00',
          createdAt: daysAgo(2),
          customerPhone: '+200',
          shortNumber: 2,
        }),
        order({
          id: randomUUID(),
          tenantId,
          locationId: locationA,
          status: 'canceled',
          total: '999.00',
          createdAt: daysAgo(3),
          customerPhone: '+300',
          shortNumber: 3,
        }),
        order({
          id: randomUUID(),
          tenantId,
          locationId: locationB,
          status: 'completed',
          total: '25.00',
          createdAt: daysAgo(40),
          customerPhone: '+100',
          shortNumber: 4,
        }),
        order({
          id: randomUUID(),
          tenantId: otherTenantId,
          locationId: otherLocation,
          status: 'completed',
          total: '777.00',
          createdAt: daysAgo(1),
          customerPhone: '+900',
          shortNumber: 5,
        }),
      ]);

      const paymentId = randomUUID();
      await tx.insert(schema.payments).values({
        id: paymentId,
        tenantId,
        orderId: paidOrder,
        status: 'succeeded',
        amount: '100.00',
        currency: 'EUR',
      });
      await tx.insert(schema.paymentRefunds).values([
        {
          id: randomUUID(),
          tenantId,
          paymentId,
          refundRequestId: randomUUID(),
          amount: '10.00',
          reason: 'requested_by_customer',
          status: 'succeeded',
          createdAt: daysAgo(1),
        },
        {
          id: randomUUID(),
          tenantId,
          paymentId,
          refundRequestId: randomUUID(),
          amount: '5.00',
          reason: 'requested_by_customer',
          status: 'failed',
          createdAt: daysAgo(1),
        },
      ]);
    });
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopDbStack(stack);
  });

  const read = (locationIds: readonly string[], window = { from, to }) =>
    runInTenantContext({ tenantId }, () =>
      reader.readDashboardTotals({
        tenantId: TenantId.parse(tenantId),
        locationIds,
        from: window.from,
        to: window.to,
      }),
    );

  it('counts paid money and leaves canceled orders out', async () => {
    const totals = await read([locationA, locationB]);

    expect(totals.revenue).toBe('150.00');
    expect(totals.completedOrders).toBe(1);
  });

  it('counts a guest as new only when their first paid order falls in the window', async () => {
    const totals = await read([locationA, locationB]);

    expect(totals.newGuests).toBe(1);
  });

  it('sums succeeded refunds and ignores failed ones', async () => {
    const totals = await read([locationA, locationB]);

    expect(totals.refunds).toBe('10.00');
  });

  it('narrows to the requested locations', async () => {
    const totals = await read([locationB]);

    expect(totals.revenue).toBe('0.00');
    expect(totals.completedOrders).toBe(0);
    expect(totals.refunds).toBe('0.00');
  });

  it('never reaches another tenant, even when handed its location id', async () => {
    const totals = await read([otherLocation]);

    expect(totals.revenue).toBe('0.00');
    expect(totals.completedOrders).toBe(0);
    expect(totals.newGuests).toBe(0);
  });

  it('returns zeroes for an empty location set', async () => {
    const totals = await read([]);

    expect(totals).toEqual({
      revenue: '0.00',
      completedOrders: 0,
      newGuests: 0,
      refunds: '0.00',
    });
  });
});
