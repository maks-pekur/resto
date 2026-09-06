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
import { TransactionDrizzleReader } from '../../src/contexts/payments/infrastructure/transaction-drizzle.reader';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[transaction-reader] Docker not available — skipping.');
}

suite('TransactionDrizzleReader', () => {
  let stack: DbStack;
  let reader: TransactionDrizzleReader;

  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const locationId = randomUUID();
  const otherLocationId = randomUUID();

  const paidPayment = randomUUID();
  const refundedPayment = randomUUID();
  const failedPayment = randomUUID();

  let shortNumber = 1;

  const seedPayment = async (input: {
    paymentId: string;
    tenantIdOverride?: string;
    locationIdOverride?: string;
    amount: string;
    refundedAmount: string;
    createdAt: Date;
  }): Promise<void> => {
    const orderId = randomUUID();
    const tenant = input.tenantIdOverride ?? tenantId;
    await stack.db.withoutTenant('seed transaction fixtures', async (tx) => {
      await tx.insert(schema.orders).values({
        id: orderId,
        tenantId: tenant,
        locationId: input.locationIdOverride ?? locationId,
        idempotencyKey: orderId,
        orderNumber: `T-${String(shortNumber)}`,
        status: 'completed',
        orderType: 'dine_in',
        subtotal: input.amount,
        total: input.amount,
        currency: 'EUR',
        shortNumber: shortNumber++,
        createdAt: input.createdAt,
      });
      await tx.insert(schema.payments).values({
        id: input.paymentId,
        tenantId: tenant,
        orderId,
        status: 'succeeded',
        amount: input.amount,
        refundedAmount: input.refundedAmount,
        currency: 'EUR',
        createdAt: input.createdAt,
      });
    });
  };

  const seedRefund = async (paymentId: string, status: string): Promise<void> => {
    await stack.db.withoutTenant('seed refund fixture', (tx) =>
      tx.insert(schema.paymentRefunds).values({
        id: randomUUID(),
        tenantId,
        paymentId,
        refundRequestId: randomUUID(),
        amount: '5.00',
        reason: 'requested_by_customer',
        status,
      }),
    );
  };

  beforeAll(async () => {
    stack = await startDbStack();
    reader = new TransactionDrizzleReader(stack.db);

    await stack.db.withoutTenant('seed transaction tenants', async (tx) => {
      await tx.insert(schema.tenants).values([
        {
          id: tenantId,
          slug: `tx-${tenantId.slice(0, 8)}`,
          displayName: 'Tx Tenant',
          locale: 'en',
          country: 'GB',
          defaultCurrency: 'EUR',
        },
        {
          id: otherTenantId,
          slug: `tx-other-${otherTenantId.slice(0, 8)}`,
          displayName: 'Other Tx Tenant',
          locale: 'en',
          country: 'GB',
          defaultCurrency: 'EUR',
        },
      ]);
      await tx.insert(schema.locations).values([
        { id: locationId, tenantId, name: 'Main', slug: 'main' },
        { id: otherLocationId, tenantId: otherTenantId, name: 'Foreign', slug: 'foreign' },
      ]);
    });

    const now = new Date();
    await seedPayment({
      paymentId: paidPayment,
      amount: '100.00',
      refundedAmount: '0.00',
      createdAt: now,
    });
    await seedPayment({
      paymentId: refundedPayment,
      amount: '80.00',
      refundedAmount: '80.00',
      createdAt: now,
    });
    await seedRefund(refundedPayment, 'succeeded');
    await seedPayment({
      paymentId: failedPayment,
      amount: '60.00',
      refundedAmount: '0.00',
      createdAt: now,
    });
    await seedRefund(failedPayment, 'failed');
    await seedPayment({
      paymentId: randomUUID(),
      tenantIdOverride: otherTenantId,
      locationIdOverride: otherLocationId,
      amount: '999.00',
      refundedAmount: '0.00',
      createdAt: now,
    });
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopDbStack(stack);
  });

  const list = (status: 'all' | 'paid' | 'refunded' | 'refund_failed') =>
    runInTenantContext({ tenantId }, () =>
      reader.list({ tenantId: TenantId.parse(tenantId), status, limit: 50, offset: 0 }),
    );

  it('lists this tenant and no other', async () => {
    const result = await list('all');

    expect(result.total).toBe(3);
    expect(result.rows.map((r) => r.paymentId).sort()).toEqual(
      [paidPayment, refundedPayment, failedPayment].sort(),
    );
  });

  it('separates a clean payment from one that was refunded', async () => {
    const paid = await list('paid');
    const refunded = await list('refunded');

    expect(paid.rows.map((r) => r.paymentId)).toEqual([paidPayment]);
    expect(refunded.rows.map((r) => r.paymentId)).toEqual([refundedPayment]);
  });

  it('finds the payment whose refund failed, and flags it on the row', async () => {
    const result = await list('refund_failed');

    expect(result.rows.map((r) => r.paymentId)).toEqual([failedPayment]);
    expect(result.rows[0]?.hasFailedRefund).toBe(true);
  });

  it('carries the order number so the operator can find the order', async () => {
    const result = await list('refund_failed');

    expect(result.rows[0]?.orderShortNumber).toBeGreaterThan(0);
  });

  it('counts failed refunds for the whole tenant, whatever the dates on screen', async () => {
    const count = await runInTenantContext({ tenantId }, () =>
      reader.countFailedRefunds(TenantId.parse(tenantId)),
    );

    expect(count).toBe(1);
  });
});
