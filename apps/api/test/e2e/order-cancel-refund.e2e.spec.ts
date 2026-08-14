import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { schema } from '@resto/db';
import { OrderId, TenantId } from '@resto/domain';
import { runInTenantContext } from '@resto/db';
import { OrderDrizzleRepository } from '../../src/contexts/ordering/infrastructure/order-drizzle.repository';
import { PaymentDrizzleRepository } from '../../src/contexts/payments/infrastructure/payment-drizzle.repository';
import { CancelOrderService } from '../../src/contexts/payments/application/cancel-order.service';
import { RefundOrderService } from '../../src/contexts/payments/application/refund-order.service';
import { RetryRefundService } from '../../src/contexts/payments/application/retry-refund.service';
import { OrderNotFoundError } from '../../src/contexts/ordering/domain/errors';
import { RefundNotRetryableError } from '../../src/contexts/payments/domain/errors';
import { isDockerAvailable, startDbStack, stopDbStack } from './helpers/with-db-stack';
import type { DbStack } from './helpers/with-db-stack';
import type { PaymentProviderPort } from '../../src/contexts/payments/domain/ports';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[order-cancel-refund] Docker not available — skipping.');
}

const STRIPE_ACCOUNT_ID = 'acct_test_cancel_refund';

// This spec is deliberately run in isolation (not part of a full apps/api
// sweep) -- the shared per-IP rate limiter plus a 50-file single-process run
// produces known false 429/timeout failures (project memory: "api
// full-suite 429 gotcha").
suite('Order cancel + refund e2e — payment-derived refundability, D-11 restructure', () => {
  let stack: DbStack;
  let tenantId: string;
  let brandId: string;
  let locationId: string;
  let shortNumberCounter = 1;

  beforeAll(async () => {
    stack = await startDbStack();
    tenantId = randomUUID();
    brandId = randomUUID();

    await stack.db.withoutTenant('seed order-cancel-refund e2e', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: tenantId,
        slug: `cancel-refund-${tenantId.slice(0, 8)}`,
        displayName: 'Cancel/Refund Test Tenant',
        locale: 'en',
        defaultCurrency: 'EUR',
      });

      await tx.insert(schema.brands).values({
        id: brandId,
        tenantId,
        slug: `cancel-refund-brand-${brandId.slice(0, 8)}`,
        displayName: 'Test Brand',
        stripeAccountId: STRIPE_ACCOUNT_ID,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeOnboardingStatus: 'complete',
      });

      const [location] = await tx
        .insert(schema.locations)
        .values({ tenantId, brandId, name: 'Cancel/Refund Test Location' })
        .returning({ id: schema.locations.id });
      if (!location) throw new Error('seed order-cancel-refund e2e: location insert failed.');
      locationId = location.id;
    });
  }, 120_000);

  afterAll(async () => {
    if (stack) await stopDbStack(stack);
  });

  const seedOrder = async (status: string, total = '20.00'): Promise<string> => {
    const orderId = randomUUID();
    await stack.db.withoutTenant('seed order for cancel/refund e2e', async (tx) => {
      await tx.insert(schema.orders).values({
        id: orderId,
        tenantId,
        brandId,
        locationId,
        idempotencyKey: randomUUID(),
        orderNumber: `ORD-CXR-${orderId.slice(0, 8)}`,
        status,
        fulfillmentMode: 'dine_in',
        subtotal: total,
        total,
        currency: 'EUR',
        shortNumber: shortNumberCounter++,
      });
    });
    return orderId;
  };

  const seedPayment = async (
    orderId: string,
    amount = '20.00',
    refundedAmount = '0.00',
  ): Promise<void> => {
    await stack.db.withoutTenant('seed payment for cancel/refund e2e', async (tx) => {
      await tx.insert(schema.payments).values({
        tenantId,
        orderId,
        status: 'succeeded',
        amount,
        currency: 'EUR',
        paymentIntentId: `pi_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
        latestChargeId: `ch_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
        refundedAmount,
        stripeAccountId: STRIPE_ACCOUNT_ID,
        applicationFeeAmount: '0.00',
      });
    });
  };

  const readOrderRow = async (orderId: string) => {
    const [row] = await stack.db.withoutTenant('read order row', async (tx) =>
      tx
        .select({
          status: schema.orders.status,
          canceledFromStatus: schema.orders.canceledFromStatus,
          cancelReason: schema.orders.cancelReason,
          cancelNote: schema.orders.cancelNote,
          canceledByUserId: schema.orders.canceledByUserId,
          canceledAt: schema.orders.canceledAt,
        })
        .from(schema.orders)
        .where(sql`${schema.orders.id} = ${orderId}`),
    );
    return row;
  };

  const readOutboxTypes = async (orderId: string): Promise<string[]> => {
    const rows = await stack.db.withoutTenant('read outbox types', async (tx) =>
      tx
        .select({ type: schema.outboxEvents.type })
        .from(schema.outboxEvents)
        .where(sql`${schema.outboxEvents.aggregateId} = ${orderId}`),
    );
    return rows.map((row) => row.type);
  };

  const readPaymentRow = async (orderId: string) => {
    const [row] = await stack.db.withoutTenant('read payment row', async (tx) =>
      tx
        .select({ status: schema.payments.status, refundedAmount: schema.payments.refundedAmount })
        .from(schema.payments)
        .where(sql`${schema.payments.orderId} = ${orderId}`),
    );
    return row;
  };

  const readRefundRows = async (orderId: string) => {
    const rows = await stack.db.withoutTenant('read payment_refunds rows', async (tx) =>
      tx
        .select({
          status: schema.paymentRefunds.status,
          stripeRefundId: schema.paymentRefunds.stripeRefundId,
          refundRequestId: schema.paymentRefunds.refundRequestId,
          amount: schema.paymentRefunds.amount,
          failureReason: schema.paymentRefunds.failureReason,
        })
        .from(schema.paymentRefunds)
        .innerJoin(schema.payments, sql`${schema.paymentRefunds.paymentId} = ${schema.payments.id}`)
        .where(sql`${schema.payments.orderId} = ${orderId}`),
    );
    return rows;
  };

  const makeProviderMock = (): PaymentProviderPort => ({
    ensureOnboardingAccount: () => Promise.reject(new Error('not used')),
    createOnboardingLink: () => Promise.reject(new Error('not used')),
    createOnboardingSession: () => Promise.reject(new Error('not used')),
    exchangeOAuthCode: () => Promise.reject(new Error('not used')),
    retrieveAccount: () => Promise.reject(new Error('not used')),
    createPaymentIntent: () => Promise.reject(new Error('not used')),
    cancelPaymentIntent: () => Promise.reject(new Error('not used')),
    createRefund: () => Promise.reject(new Error('createRefund not stubbed for this test')),
    verifyWebhookSignature: () => {
      throw new Error('not used');
    },
  });

  // Cases 1-3: cancel from every non-terminal captured-payment status.
  it.each([
    ['accepted', 'guest_no_show'],
    ['preparing', 'kitchen_too_busy'],
    ['ready', 'kitchen_out_of_stock'],
  ] as const)(
    'cancel from %s with a captured payment issues a full refund (CTO HIGH-7 regression)',
    async (status, reasonCode) => {
      // Before this plan, CancelOrderService derived refundability from
      // `wasPaid = snap.status === 'paid'`, which reads false for any
      // accepted/preparing/ready order -- the refund would have been
      // silently skipped here even though the payment was fully captured.
      // Refundability now comes solely from the payment row.
      const orderId = await seedOrder(status, '20.00');
      await seedPayment(orderId, '20.00', '0.00');

      const orderRepo = new OrderDrizzleRepository(stack.db);
      const paymentRepo = new PaymentDrizzleRepository(stack.db);
      const providerMock = makeProviderMock();
      providerMock.createRefund = () =>
        Promise.resolve({ stripeRefundId: `re_${randomUUID().slice(0, 8)}`, status: 'succeeded' });

      const refundService = new RefundOrderService(orderRepo, paymentRepo, providerMock, stack.db);
      const cancelService = new CancelOrderService(orderRepo, refundService);

      const result = await runInTenantContext({ tenantId }, () =>
        cancelService.execute({
          orderId: OrderId.parse(orderId),
          tenantId: TenantId.parse(tenantId),
          reasonCode,
          cancelNote: 'e2e cancel note',
          actorUserId: 'operator-e2e-1',
        }),
      );

      expect(result.refund.outcome).toBe('succeeded');

      const orderRow = await readOrderRow(orderId);
      expect(orderRow?.status).toBe('canceled');
      expect(orderRow?.canceledFromStatus).toBe(status);
      expect(orderRow?.cancelReason).toBe(reasonCode);
      expect(orderRow?.canceledByUserId).toBe('operator-e2e-1');
      expect(orderRow?.canceledAt).not.toBeNull();

      const refundRows = await readRefundRows(orderId);
      expect(refundRows).toHaveLength(1);
      expect(refundRows[0]?.status).toBe('succeeded');
      expect(refundRows[0]?.stripeRefundId).not.toBeNull();
      expect(refundRows[0]?.amount).toBe('20.00');

      expect(await readOutboxTypes(orderId)).toContain('ordering.order_canceled.v1');
    },
  );

  it('cancel from created (unpaid) — no refund attempted, no ledger row', async () => {
    const orderId = await seedOrder('created', '20.00');

    const orderRepo = new OrderDrizzleRepository(stack.db);
    const paymentRepo = new PaymentDrizzleRepository(stack.db);
    const providerMock = makeProviderMock();
    let createRefundCalled = false;
    providerMock.createRefund = () => {
      createRefundCalled = true;
      return Promise.resolve({ stripeRefundId: 're_should_not_happen', status: 'succeeded' });
    };

    const refundService = new RefundOrderService(orderRepo, paymentRepo, providerMock, stack.db);
    const cancelService = new CancelOrderService(orderRepo, refundService);

    const result = await runInTenantContext({ tenantId }, () =>
      cancelService.execute({
        orderId: OrderId.parse(orderId),
        tenantId: TenantId.parse(tenantId),
        reasonCode: 'guest_requested',
        actorUserId: null,
      }),
    );

    expect(result.refund).toEqual({ attempted: false, outcome: 'none', amountMinor: null });
    expect(createRefundCalled).toBe(false);

    const orderRow = await readOrderRow(orderId);
    expect(orderRow?.status).toBe('canceled');

    expect(await readRefundRows(orderId)).toHaveLength(0);
  });

  it('Stripe failure during cancel still commits the cancel and leaves a failed ledger row (D-11)', async () => {
    const orderId = await seedOrder('accepted', '20.00');
    await seedPayment(orderId, '20.00', '0.00');

    const orderRepo = new OrderDrizzleRepository(stack.db);
    const paymentRepo = new PaymentDrizzleRepository(stack.db);
    const providerMock = makeProviderMock();
    providerMock.createRefund = () => Promise.reject(new Error('stripe outage — simulated'));

    const refundService = new RefundOrderService(orderRepo, paymentRepo, providerMock, stack.db);
    const cancelService = new CancelOrderService(orderRepo, refundService);

    const result = await runInTenantContext({ tenantId }, () =>
      cancelService.execute({
        orderId: OrderId.parse(orderId),
        tenantId: TenantId.parse(tenantId),
        reasonCode: 'other',
        actorUserId: 'operator-e2e-2',
      }),
    );

    expect(result.refund.outcome).toBe('failed');

    // The kitchen is not blocked -- the order still cancels even though the
    // refund provider call failed.
    const orderRow = await readOrderRow(orderId);
    expect(orderRow?.status).toBe('canceled');

    const refundRows = await readRefundRows(orderId);
    expect(refundRows).toHaveLength(1);
    expect(refundRows[0]?.status).toBe('failed');
    expect(refundRows[0]?.failureReason).not.toBeNull();

    const paymentRow = await readPaymentRow(orderId);
    expect(paymentRow?.status).toBe('succeeded');
  });

  it('retry after a failed refund flips the same ledger row to succeeded, reusing the original refundRequestId', async () => {
    const orderId = await seedOrder('accepted', '20.00');
    await seedPayment(orderId, '20.00', '0.00');

    const orderRepo = new OrderDrizzleRepository(stack.db);
    const paymentRepo = new PaymentDrizzleRepository(stack.db);
    const providerMock = makeProviderMock();

    let firstRequestId: string | undefined;
    providerMock.createRefund = (input) => {
      firstRequestId = input.refundRequestId;
      return Promise.reject(new Error('stripe outage — simulated (first attempt)'));
    };

    const refundService = new RefundOrderService(orderRepo, paymentRepo, providerMock, stack.db);
    const cancelService = new CancelOrderService(orderRepo, refundService);

    await runInTenantContext({ tenantId }, () =>
      cancelService.execute({
        orderId: OrderId.parse(orderId),
        tenantId: TenantId.parse(tenantId),
        reasonCode: 'other',
        actorUserId: null,
      }),
    );

    const failedRows = await readRefundRows(orderId);
    expect(failedRows).toHaveLength(1);
    const failedRow = failedRows[0];
    if (!failedRow) throw new Error('expected exactly one failed payment_refunds row');
    expect(failedRow.status).toBe('failed');
    const refundRequestId = failedRow.refundRequestId;
    expect(refundRequestId).toBe(firstRequestId);

    let secondRequestId: string | undefined;
    providerMock.createRefund = (input) => {
      secondRequestId = input.refundRequestId;
      return Promise.resolve({
        stripeRefundId: `re_retry_${randomUUID().slice(0, 8)}`,
        status: 'succeeded',
      });
    };

    const retryService = new RetryRefundService(paymentRepo, providerMock, stack.db);
    const retryResult = await runInTenantContext({ tenantId }, () =>
      retryService.execute({
        orderId: OrderId.parse(orderId),
        tenantId: TenantId.parse(tenantId),
        refundRequestId,
        actorUserId: 'operator-e2e-3',
      }),
    );

    expect(retryResult.fullyRefunded).toBe(true);
    expect(secondRequestId).toBe(firstRequestId);

    const rowsAfterRetry = await readRefundRows(orderId);
    // Row count for the order stays exactly 1 -- no duplicate ledger row.
    expect(rowsAfterRetry).toHaveLength(1);
    expect(rowsAfterRetry[0]?.status).toBe('succeeded');
    expect(rowsAfterRetry[0]?.stripeRefundId).not.toBeNull();
    expect(rowsAfterRetry[0]?.refundRequestId).toBe(refundRequestId);

    const paymentRow = await readPaymentRow(orderId);
    expect(paymentRow?.refundedAmount).toBe('20.00');
  });

  it('retry on a non-failed (already succeeded) row is rejected', async () => {
    const orderId = await seedOrder('accepted', '20.00');
    await seedPayment(orderId, '20.00', '0.00');

    const orderRepo = new OrderDrizzleRepository(stack.db);
    const paymentRepo = new PaymentDrizzleRepository(stack.db);
    const providerMock = makeProviderMock();
    providerMock.createRefund = () =>
      Promise.resolve({ stripeRefundId: `re_${randomUUID().slice(0, 8)}`, status: 'succeeded' });

    const refundService = new RefundOrderService(orderRepo, paymentRepo, providerMock, stack.db);
    const cancelService = new CancelOrderService(orderRepo, refundService);

    await runInTenantContext({ tenantId }, () =>
      cancelService.execute({
        orderId: OrderId.parse(orderId),
        tenantId: TenantId.parse(tenantId),
        reasonCode: 'other',
        actorUserId: null,
      }),
    );

    const rows = await readRefundRows(orderId);
    expect(rows).toHaveLength(1);
    const succeededRow = rows[0];
    if (!succeededRow) throw new Error('expected exactly one payment_refunds row');
    expect(succeededRow.status).toBe('succeeded');
    const refundRequestId = succeededRow.refundRequestId;

    const retryService = new RetryRefundService(paymentRepo, providerMock, stack.db);
    await expect(
      runInTenantContext({ tenantId }, () =>
        retryService.execute({
          orderId: OrderId.parse(orderId),
          tenantId: TenantId.parse(tenantId),
          refundRequestId,
          actorUserId: null,
        }),
      ),
    ).rejects.toBeInstanceOf(RefundNotRetryableError);
  });

  it('discretionary partial refund on a preparing order leaves fulfillment status alone (D-10)', async () => {
    const orderId = await seedOrder('preparing', '20.00');
    await seedPayment(orderId, '20.00', '0.00');

    const orderRepo = new OrderDrizzleRepository(stack.db);
    const paymentRepo = new PaymentDrizzleRepository(stack.db);
    const providerMock = makeProviderMock();
    providerMock.createRefund = () =>
      Promise.resolve({
        stripeRefundId: `re_partial_${randomUUID().slice(0, 8)}`,
        status: 'succeeded',
      });

    const refundService = new RefundOrderService(orderRepo, paymentRepo, providerMock, stack.db);

    await runInTenantContext({ tenantId }, () =>
      refundService.execute({
        orderId: OrderId.parse(orderId),
        tenantId: TenantId.parse(tenantId),
        amountMinor: 500,
        reason: 'goodwill gesture — one item missing',
      }),
    );

    const orderRow = await readOrderRow(orderId);
    expect(orderRow?.status).toBe('preparing');

    const paymentRow = await readPaymentRow(orderId);
    expect(paymentRow?.status).toBe('partially_refunded');

    const refundRows = await readRefundRows(orderId);
    expect(refundRows).toHaveLength(1);
    expect(refundRows[0]?.status).toBe('succeeded');
  });

  it('cross-tenant cancel is denied (existence-hiding OrderNotFoundError) and the order is unchanged', async () => {
    const otherTenantId = randomUUID();
    await stack.db.withoutTenant('seed second tenant for cross-tenant e2e', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: otherTenantId,
        slug: `cancel-refund-other-${otherTenantId.slice(0, 8)}`,
        displayName: 'Other Tenant',
        locale: 'en',
        defaultCurrency: 'EUR',
      });
    });

    const orderId = await seedOrder('accepted', '20.00');
    await seedPayment(orderId, '20.00', '0.00');

    const orderRepo = new OrderDrizzleRepository(stack.db);
    const paymentRepo = new PaymentDrizzleRepository(stack.db);
    const providerMock = makeProviderMock();
    let createRefundCalled = false;
    providerMock.createRefund = () => {
      createRefundCalled = true;
      return Promise.resolve({ stripeRefundId: 're_should_not_happen', status: 'succeeded' });
    };

    const refundService = new RefundOrderService(orderRepo, paymentRepo, providerMock, stack.db);
    const cancelService = new CancelOrderService(orderRepo, refundService);

    await expect(
      runInTenantContext({ tenantId: otherTenantId }, () =>
        cancelService.execute({
          orderId: OrderId.parse(orderId),
          tenantId: TenantId.parse(otherTenantId),
          reasonCode: 'other',
          actorUserId: null,
        }),
      ),
    ).rejects.toBeInstanceOf(OrderNotFoundError);

    expect(createRefundCalled).toBe(false);

    const orderRow = await readOrderRow(orderId);
    expect(orderRow?.status).toBe('accepted');
  });
});
