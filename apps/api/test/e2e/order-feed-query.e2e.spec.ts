import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { schema } from '@resto/db';
import { runInTenantContext } from '@resto/db';
import { OrderFeedDrizzleRepository } from '../../src/contexts/ordering/infrastructure/order-feed-drizzle.repository';
import { LocationDrizzleRepository } from '../../src/contexts/tenancy/infrastructure/location-drizzle.repository';
import { PaymentDrizzleRepository } from '../../src/contexts/payments/infrastructure/payment-drizzle.repository';
import { ListOrdersService } from '../../src/contexts/ordering/application/list-orders.service';
import { isDockerAvailable, startDbStack, stopDbStack } from './helpers/with-db-stack';
import type { DbStack } from './helpers/with-db-stack';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[order-feed-query] Docker not available — skipping.');
}

suite('Order feed query e2e — filters, cursor, all-mode merge, cross-tenant isolation', () => {
  let stack: DbStack;
  let tenantId: string;
  let locationAId: string;
  let locationBId: string;
  let otherTenantId: string;
  let otherLocationId: string;
  let shortNumberCounter = 1;

  beforeAll(async () => {
    stack = await startDbStack();
    tenantId = randomUUID();
    otherTenantId = randomUUID();

    await stack.db.withoutTenant('seed order-feed-query e2e', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: tenantId,
        slug: `feed-${tenantId.slice(0, 8)}`,
        displayName: 'Feed Test Tenant',
        locale: 'en',
        country: 'GB',
        defaultCurrency: 'EUR',
      });

      const [locA] = await tx
        .insert(schema.locations)
        .values({ tenantId, name: 'Location A' })
        .returning({ id: schema.locations.id });
      const [locB] = await tx
        .insert(schema.locations)
        .values({ tenantId, name: 'Location B' })
        .returning({ id: schema.locations.id });
      if (!locA || !locB) throw new Error('seed order-feed-query e2e: location insert failed.');
      locationAId = locA.id;
      locationBId = locB.id;

      await tx.insert(schema.tenants).values({
        id: otherTenantId,
        slug: `feed-other-${otherTenantId.slice(0, 8)}`,
        displayName: 'Other Tenant',
        locale: 'en',
        country: 'GB',
        defaultCurrency: 'EUR',
      });
      const [otherLoc] = await tx
        .insert(schema.locations)
        .values({ tenantId: otherTenantId, name: 'Other Location' })
        .returning({ id: schema.locations.id });
      if (!otherLoc) throw new Error('seed order-feed-query e2e: other-tenant location failed.');
      otherLocationId = otherLoc.id;
    });
  }, 120_000);

  afterAll(async () => {
    if (stack) await stopDbStack(stack);
  });

  const seedOrder = async (opts: {
    tenantIdOverride?: string;
    locationId: string;
    status: string;
    channel?: 'site' | 'qr-menu';
    createdAt: Date;
  }): Promise<string> => {
    const orderId = randomUUID();
    await stack.db.withoutTenant('seed order for feed e2e', async (tx) => {
      await tx.insert(schema.orders).values({
        id: orderId,
        tenantId: opts.tenantIdOverride ?? tenantId,
        locationId: opts.locationId,
        idempotencyKey: randomUUID(),
        orderNumber: `ORD-FEED-${orderId.slice(0, 8)}`,
        status: opts.status,
        fulfillmentMode: 'dine_in',
        subtotal: '10.00',
        total: '10.00',
        currency: 'EUR',
        shortNumber: shortNumberCounter++,
        channel: opts.channel ?? 'site',
        createdAt: opts.createdAt,
        updatedAt: opts.createdAt,
      });
    });
    return orderId;
  };

  const makeListOrdersService = (): ListOrdersService => {
    const feedRepo = new OrderFeedDrizzleRepository(stack.db);
    const locationsRepo = new LocationDrizzleRepository(stack.db);
    const paymentsRepo = new PaymentDrizzleRepository(stack.db);
    return new ListOrdersService(feedRepo, locationsRepo, paymentsRepo);
  };

  it('status preset "active" filters to paid/accepted/preparing/ready within a location', async () => {
    const now = new Date();
    const paidId = await seedOrder({ locationId: locationAId, status: 'paid', createdAt: now });
    const acceptedId = await seedOrder({
      locationId: locationAId,
      status: 'accepted',
      createdAt: now,
    });
    const completedId = await seedOrder({
      locationId: locationAId,
      status: 'completed',
      createdAt: now,
    });

    const service = makeListOrdersService();
    const result = await runInTenantContext({ tenantId, locationId: locationAId }, () =>
      service.execute({ statusPreset: 'active' }),
    );

    const ids = result.rows.map((r) => r.id);
    expect(ids).toContain(paidId);
    expect(ids).toContain(acceptedId);
    expect(ids).not.toContain(completedId);
  });

  it('channel filter narrows to the requested channel', async () => {
    const now = new Date();
    const siteId = await seedOrder({
      locationId: locationAId,
      status: 'paid',
      channel: 'site',
      createdAt: now,
    });
    const qrId = await seedOrder({
      locationId: locationAId,
      status: 'paid',
      channel: 'qr-menu',
      createdAt: now,
    });

    const service = makeListOrdersService();
    const result = await runInTenantContext({ tenantId, locationId: locationAId }, () =>
      service.execute({ statusPreset: 'all_today', channel: 'site' }),
    );

    const ids = result.rows.map((r) => r.id);
    expect(ids).toContain(siteId);
    expect(ids).not.toContain(qrId);
  });

  it('date-range boundary excludes yesterday when preset is "today"', async () => {
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const withinToday = new Date(todayStart.getTime() + 60 * 60 * 1000);
    const yesterday = new Date(todayStart.getTime() - 60 * 60 * 1000);

    const todayOrderId = await seedOrder({
      locationId: locationAId,
      status: 'paid',
      createdAt: withinToday,
    });
    const yesterdayOrderId = await seedOrder({
      locationId: locationAId,
      status: 'paid',
      createdAt: yesterday,
    });

    const service = makeListOrdersService();
    const todayResult = await runInTenantContext({ tenantId, locationId: locationAId }, () =>
      service.execute({ statusPreset: 'all_today', datePreset: 'today' }),
    );
    const todayIds = todayResult.rows.map((r) => r.id);
    expect(todayIds).toContain(todayOrderId);
    expect(todayIds).not.toContain(yesterdayOrderId);

    const yesterdayResult = await runInTenantContext({ tenantId, locationId: locationAId }, () =>
      service.execute({ statusPreset: 'all_today', datePreset: 'yesterday' }),
    );
    const yesterdayIds = yesterdayResult.rows.map((r) => r.id);
    expect(yesterdayIds).toContain(yesterdayOrderId);
    expect(yesterdayIds).not.toContain(todayOrderId);
  });

  it('since cursor returns only rows newer than the cursor', async () => {
    const base = new Date();
    const olderId = await seedOrder({ locationId: locationAId, status: 'paid', createdAt: base });
    const newerCreatedAt = new Date(base.getTime() + 1_000);
    const newerId = await seedOrder({
      locationId: locationAId,
      status: 'paid',
      createdAt: newerCreatedAt,
    });

    const service = makeListOrdersService();
    const result = await runInTenantContext({ tenantId, locationId: locationAId }, () =>
      service.execute({
        statusPreset: 'all_today',
        since: { createdAt: base, id: olderId },
      }),
    );

    const ids = result.rows.map((r) => r.id);
    expect(ids).toContain(newerId);
    expect(ids).not.toContain(olderId);
  });

  it('each location sees only its own rows, labelled with its own name', async () => {
    const now = new Date();
    const orderAId = await seedOrder({ locationId: locationAId, status: 'paid', createdAt: now });
    const orderBId = await seedOrder({ locationId: locationBId, status: 'paid', createdAt: now });

    const service = makeListOrdersService();
    const resultA = await runInTenantContext({ tenantId, locationId: locationAId }, () =>
      service.execute({ statusPreset: 'all_today' }),
    );
    const resultB = await runInTenantContext({ tenantId, locationId: locationBId }, () =>
      service.execute({ statusPreset: 'all_today' }),
    );

    expect(resultA.rows.find((r) => r.id === orderAId)?.locationName).toBe('Location A');
    expect(resultA.rows.map((r) => r.id)).not.toContain(orderBId);
    expect(resultB.rows.find((r) => r.id === orderBId)?.locationName).toBe('Location B');
    expect(resultB.rows.map((r) => r.id)).not.toContain(orderAId);
  });

  it('a missing location context is refused rather than widened to the whole tenant', async () => {
    const service = makeListOrdersService();
    await expect(
      runInTenantContext({ tenantId }, () => service.execute({ statusPreset: 'all_today' })),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('a location belonging to a different tenant is not readable', async () => {
    const service = makeListOrdersService();
    await expect(
      runInTenantContext({ tenantId, locationId: otherLocationId }, () =>
        service.execute({ statusPreset: 'all_today' }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('hasFailedRefund is true only for an order with a failed payment_refunds row', async () => {
    const now = new Date();
    const failedOrderId = await seedOrder({
      locationId: locationAId,
      status: 'completed',
      createdAt: now,
    });
    const cleanOrderId = await seedOrder({
      locationId: locationAId,
      status: 'completed',
      createdAt: now,
    });

    await stack.db.withoutTenant('seed failed refund for feed e2e', async (tx) => {
      const [payment] = await tx
        .insert(schema.payments)
        .values({
          tenantId,
          orderId: failedOrderId,
          status: 'succeeded',
          amount: '10.00',
          currency: 'EUR',
          paymentIntentId: `pi_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
          refundedAmount: '0.00',
          applicationFeeAmount: '0.00',
        })
        .returning({ id: schema.payments.id });
      if (!payment) throw new Error('seed failed refund: payment insert failed.');
      await tx.insert(schema.paymentRefunds).values({
        tenantId,
        paymentId: payment.id,
        stripeRefundId: null,
        refundRequestId: randomUUID(),
        amount: '10.00',
        reason: 'e2e failed refund',
        status: 'failed',
        failureReason: 'simulated provider outage',
      });
    });

    const service = makeListOrdersService();
    const result = await runInTenantContext({ tenantId, locationId: locationAId }, () =>
      service.execute({ statusPreset: 'all_today' }),
    );

    const failedRow = result.rows.find((r) => r.id === failedOrderId);
    const cleanRow = result.rows.find((r) => r.id === cleanOrderId);
    expect(failedRow?.hasFailedRefund).toBe(true);
    expect(cleanRow?.hasFailedRefund).toBe(false);
  });

  it('cross-tenant orders never appear', async () => {
    const now = new Date();
    const otherTenantOrderId = await seedOrder({
      tenantIdOverride: otherTenantId,
      locationId: otherLocationId,
      status: 'paid',
      createdAt: now,
    });
    const ownOrderId = await seedOrder({ locationId: locationAId, status: 'paid', createdAt: now });

    const service = makeListOrdersService();
    const result = await runInTenantContext({ tenantId, locationId: locationAId }, () =>
      service.execute({ statusPreset: 'all_today' }),
    );

    const ids = result.rows.map((r) => r.id);
    expect(ids).toContain(ownOrderId);
    expect(ids).not.toContain(otherTenantOrderId);
    expect(result.rows.every((r) => r.locationId !== otherLocationId)).toBe(true);
  });

  it('orders_feed_idx exists with the (tenant_id, location_id, status, created_at) column shape', async () => {
    const rows = await stack.db.withoutTenant('read orders_feed_idx definition', async (tx) =>
      tx.execute<{ indexdef: string }>(
        sql`SELECT indexdef FROM pg_indexes WHERE indexname = 'orders_feed_idx'`,
      ),
    );
    const indexdef = rows[0]?.indexdef ?? '';
    expect(indexdef).toContain('tenant_id');
    expect(indexdef).toContain('location_id');
    expect(indexdef).toContain('status');
    expect(indexdef).toContain('created_at');
  });
});
