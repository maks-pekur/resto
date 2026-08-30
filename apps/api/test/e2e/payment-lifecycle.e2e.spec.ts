import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { schema } from '@resto/db';
import { Currency, OrderId, TenantId } from '@resto/domain';
import { runInTenantContext } from '@resto/db';
import { OrderDrizzleRepository } from '../../src/contexts/ordering/infrastructure/order-drizzle.repository';
import { PaymentDrizzleRepository } from '../../src/contexts/payments/infrastructure/payment-drizzle.repository';
import { CreateCheckoutPaymentService } from '../../src/contexts/payments/application/create-checkout-payment.service';
import { HandleStripeEventService } from '../../src/contexts/payments/application/handle-stripe-event.service';
import { CancelOrderService } from '../../src/contexts/payments/application/cancel-order.service';
import { RefundOrderService } from '../../src/contexts/payments/application/refund-order.service';
import { isDockerAvailable, startDbStack, stopDbStack } from './helpers/with-db-stack';
import type { DbStack } from './helpers/with-db-stack';
import type { TenantRepository } from '../../src/contexts/tenancy/domain/ports';
import type { TenantSnapshot } from '../../src/contexts/tenancy/domain/tenant.aggregate';
import type { PaymentProviderPort } from '../../src/contexts/payments/domain/ports';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[payment-lifecycle] Docker not available — skipping.');
}

const STRIPE_ACCOUNT_ID = 'acct_1TestLifecycle0099';

const makeFakeTenantSnap = (tid: string, slug: string): TenantSnapshot => ({
  id: TenantId.parse(tid),
  slug,
  displayName: 'Test Tenant',
  status: 'active',
  locale: 'en',
  timezone: 'Europe/Madrid',
  country: 'ES',
  defaultCurrency: Currency.parse('EUR'),
  theme: null,
  legalName: null,
  legalForm: null,
  taxId: null,
  stripeAccountId: STRIPE_ACCOUNT_ID,
  paymentProvider: 'stripe',
  accountType: 'express',
  stripeChargesEnabled: true,
  stripePayoutsEnabled: true,
  stripeOnboardingStatus: 'complete',
  stripeRequirementsDue: null,
  fiscalizationConfig: null,
  primaryDomain: {
    id: randomUUID(),
    tenantId: tid,
    domain: `${slug}.menu.resto.app`,
    kind: 'subdomain',
    isPrimary: true,
    verifiedAt: new Date(),
    createdAt: new Date(),
  },
  customDomains: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
  offboardingScheduledAt: null,
  offboardingExecutedAt: null,
  offboardingRequestedBy: null,
});

const makeTenantRepoMock = (overrides: Partial<TenantRepository> = {}): TenantRepository => ({
  findById: vi.fn().mockResolvedValue(null),
  findBySlug: vi.fn().mockResolvedValue(null),
  findByDomainHost: vi.fn().mockResolvedValue(null),
  findByStripeAccountId: vi.fn().mockResolvedValue(null),
  save: vi.fn().mockResolvedValue(undefined),
  listDomains: vi.fn().mockResolvedValue([]),
  findCurrentTenant: vi.fn().mockResolvedValue(null),
  listCurrentTenantDomains: vi.fn().mockResolvedValue([]),
  eraseTenant: vi.fn(),
  listScheduledForErasure: vi.fn().mockResolvedValue([]),
  ...overrides,
});

suite('Payment lifecycle e2e — order created→requires_action→paid→refunded (PAY-BUG3/4)', () => {
  let stack: DbStack;
  let tenantId: string;
  let orderId: string;
  let locationId: string;

  beforeAll(async () => {
    stack = await startDbStack();
    tenantId = randomUUID();
    orderId = randomUUID();

    await stack.db.withoutTenant('seed lifecycle e2e', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: tenantId,
        slug: `lifecycle-${tenantId.slice(0, 8)}`,
        displayName: 'Lifecycle Test Tenant',
        locale: 'en',
        country: 'ES',
        defaultCurrency: 'EUR',
        stripeAccountId: STRIPE_ACCOUNT_ID,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeOnboardingStatus: 'complete',
      });

      const [location] = await tx
        .insert(schema.locations)
        .values({ tenantId, name: 'Lifecycle Test Location', slug: 'lifecycle-test-location' })
        .returning({ id: schema.locations.id });
      if (!location) throw new Error('seed lifecycle e2e: location insert failed.');
      locationId = location.id;

      await tx.insert(schema.orders).values({
        id: orderId,
        tenantId,
        locationId: location.id,
        idempotencyKey: randomUUID(),
        orderNumber: 'ORD-LIFECYCLE-001',
        status: 'created',
        orderType: 'dine_in',
        subtotal: '15.00',
        total: '15.00',
        currency: 'EUR',
        shortNumber: 1,
      });
    });
  }, 120_000);

  afterAll(async () => {
    if (stack) await stopDbStack(stack);
  });

  let seedOrderShortNumberCounter = 2; // beforeAll's fixed fixture order used 1.

  const seedOrder = async (status: string, total = '15.00'): Promise<string> => {
    const newOrderId = randomUUID();
    await stack.db.withoutTenant('seed order for status persistence e2e', async (tx) => {
      await tx.insert(schema.orders).values({
        id: newOrderId,
        tenantId,
        locationId,
        idempotencyKey: randomUUID(),
        orderNumber: `ORD-PERSIST-${newOrderId.slice(0, 8)}`,
        status,
        orderType: 'dine_in',
        subtotal: total,
        total,
        currency: 'EUR',
        shortNumber: seedOrderShortNumberCounter++,
      });
    });
    return newOrderId;
  };

  const seedPayment = async (seededOrderId: string, amount = '15.00'): Promise<void> => {
    await stack.db.withoutTenant('seed payment for status persistence e2e', async (tx) => {
      await tx.insert(schema.payments).values({
        tenantId,
        orderId: seededOrderId,
        status: 'succeeded',
        amount,
        currency: 'EUR',
        paymentIntentId: `pi_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
        latestChargeId: `ch_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
        refundedAmount: '0.00',
        stripeAccountId: STRIPE_ACCOUNT_ID,
        applicationFeeAmount: '0.00',
      });
    });
  };

  const readOrderStatus = async (seededOrderId: string): Promise<string | undefined> => {
    const [row] = await stack.db.withoutTenant('read order status', async (tx) =>
      tx
        .select({ status: schema.orders.status })
        .from(schema.orders)
        .where(sql`${schema.orders.id} = ${seededOrderId}`),
    );
    return row?.status;
  };

  const readOutboxTypes = async (seededOrderId: string): Promise<string[]> => {
    const rows = await stack.db.withoutTenant('read outbox types', async (tx) =>
      tx
        .select({ type: schema.outboxEvents.type })
        .from(schema.outboxEvents)
        .where(sql`${schema.outboxEvents.aggregateId} = ${seededOrderId}`),
    );
    return rows.map((row) => row.type);
  };

  it('step 2: checkout service transitions order to requires_action and writes payment row', async () => {
    const orderRepo = new OrderDrizzleRepository(stack.db);
    const paymentRepo = new PaymentDrizzleRepository(stack.db);

    const piId = `pi_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const clientSecret = `${piId}_secret_test`;

    const tenantRepoMock = makeTenantRepoMock({
      findById: vi
        .fn()
        .mockResolvedValue(makeFakeTenantSnap(tenantId, `lifecycle-${tenantId.slice(0, 8)}`)),
    });

    const providerMock: PaymentProviderPort = {
      ensureOnboardingAccount: vi.fn().mockResolvedValue({ accountId: STRIPE_ACCOUNT_ID }),
      createOnboardingLink: vi.fn().mockResolvedValue({ url: '', expiresAt: 0 }),
      createOnboardingSession: vi.fn().mockResolvedValue({ clientSecret: '' }),
      exchangeOAuthCode: vi.fn().mockResolvedValue({ accountId: STRIPE_ACCOUNT_ID }),
      retrieveAccount: vi
        .fn()
        .mockResolvedValue({ chargesEnabled: true, payoutsEnabled: true, requirementsDue: null }),
      createPaymentIntent: vi.fn().mockResolvedValue({
        paymentIntentId: piId,
        clientSecret,
        status: 'requires_payment_method',
      }),
      cancelPaymentIntent: vi.fn().mockResolvedValue({ status: 'canceled' }),
      createRefund: vi.fn().mockResolvedValue({ stripeRefundId: 're_test', status: 'succeeded' }),
      verifyWebhookSignature: vi
        .fn()
        .mockReturnValue({ id: 'evt_test', type: 'account.updated', data: {} }),
    };

    const checkoutService = new CreateCheckoutPaymentService(
      orderRepo,
      tenantRepoMock,
      paymentRepo,
      providerMock,
      stack.db,
      0,
    );

    await runInTenantContext({ tenantId }, () =>
      checkoutService.execute({ orderId, tenantId: TenantId.parse(tenantId) }),
    );

    expect(clientSecret).toBeDefined();
    expect(STRIPE_ACCOUNT_ID).toBeDefined();

    const [orderRow] = await stack.db.withoutTenant('verify order after checkout', async (tx) =>
      tx
        .select({ status: schema.orders.status })
        .from(schema.orders)
        .where(sql`${schema.orders.id} = ${orderId}`),
    );
    expect(orderRow?.status).toBe('requires_action');

    const [paymentRow] = await stack.db.withoutTenant('verify payment after checkout', async (tx) =>
      tx
        .select({
          status: schema.payments.status,
          paymentIntentId: schema.payments.paymentIntentId,
        })
        .from(schema.payments)
        .where(sql`${schema.payments.orderId} = ${orderId}`),
    );
    expect(paymentRow?.status).toBe('requires_action');
    expect(paymentRow?.paymentIntentId).toBe(piId);
  });

  it('step 3: payment_intent.succeeded marks order paid + inbox dedup + outbox row (BUG-4 markPaid path + PAY-13)', async () => {
    const orderRepo = new OrderDrizzleRepository(stack.db);
    const paymentRepo = new PaymentDrizzleRepository(stack.db);

    const [existingPaymentRow] = await stack.db.withoutTenant('read pi id for step 3', async (tx) =>
      tx
        .select({ paymentIntentId: schema.payments.paymentIntentId })
        .from(schema.payments)
        .where(sql`${schema.payments.orderId} = ${orderId}`),
    );

    const piId =
      existingPaymentRow?.paymentIntentId ?? `pi_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const stripeEventId = `evt_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

    const tenantRepoMock = makeTenantRepoMock();

    const providerMock: PaymentProviderPort = {
      ensureOnboardingAccount: vi.fn(),
      createOnboardingLink: vi.fn(),
      createOnboardingSession: vi.fn(),
      exchangeOAuthCode: vi.fn(),
      retrieveAccount: vi.fn(),
      createPaymentIntent: vi.fn(),
      cancelPaymentIntent: vi.fn(),
      createRefund: vi.fn(),
      verifyWebhookSignature: vi.fn(),
    };

    const handlerService = new HandleStripeEventService(
      stack.db,
      tenantRepoMock,
      orderRepo,
      paymentRepo,
      providerMock,
    );

    const piSucceededEvent = {
      id: stripeEventId,
      type: 'payment_intent.succeeded' as const,
      account: STRIPE_ACCOUNT_ID,
      data: {
        object: {
          id: piId,
          latest_charge: `ch_test_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
          amount: 1500,
          currency: 'eur',
          metadata: { orderId, tenantId },
        },
      },
    };

    // No tenant ALS — mirrors production: StripeWebhookController is @Public with no
    // TenantContextMiddleware; handler resolves tenantId from event metadata (ADR-0020 I-6).
    await handlerService.handle(piSucceededEvent);

    const [orderRow] = await stack.db.withoutTenant('verify order paid', async (tx) =>
      tx
        .select({ status: schema.orders.status })
        .from(schema.orders)
        .where(sql`${schema.orders.id} = ${orderId}`),
    );
    expect(orderRow?.status).toBe('paid');

    const [paymentRow] = await stack.db.withoutTenant('verify payment succeeded', async (tx) =>
      tx
        .select({ status: schema.payments.status })
        .from(schema.payments)
        .where(sql`${schema.payments.orderId} = ${orderId}`),
    );
    expect(paymentRow?.status).toBe('succeeded');

    const inboxRows = await stack.db.withoutTenant('verify inbox row written', async (tx) =>
      tx
        .select({ eventId: schema.inboxProcessed.eventId })
        .from(schema.inboxProcessed)
        .where(
          sql`${schema.inboxProcessed.eventId} = ${stripeEventId} AND ${schema.inboxProcessed.consumer} = 'payments-webhook'`,
        ),
    );
    expect(inboxRows).toHaveLength(1);
    expect(inboxRows[0]?.eventId).toBe(stripeEventId);

    const [outboxRow] = await stack.db.withoutTenant('verify outbox entry', async (tx) =>
      tx
        .select({
          aggregateId: schema.outboxEvents.aggregateId,
          type: schema.outboxEvents.type,
        })
        .from(schema.outboxEvents)
        .where(sql`${schema.outboxEvents.aggregateId} = ${orderId}`)
        .orderBy(schema.outboxEvents.occurredAt)
        .limit(1),
    );
    expect(outboxRow).toBeDefined();

    await handlerService.handle(piSucceededEvent);

    const inboxRowsAfterReplay = await stack.db.withoutTenant(
      'verify inbox dedup on replay',
      async (tx) =>
        tx
          .select({ eventId: schema.inboxProcessed.eventId })
          .from(schema.inboxProcessed)
          .where(
            sql`${schema.inboxProcessed.eventId} = ${stripeEventId} AND ${schema.inboxProcessed.consumer} = 'payments-webhook'`,
          ),
    );
    expect(inboxRowsAfterReplay).toHaveLength(1);
  });

  it('step 4: charge.refunded (real Stripe shape — no refunds.data) flips payment status to refunded (BUG-6)', async () => {
    const paymentRepo = new PaymentDrizzleRepository(stack.db);

    const [existingPaymentRow] = await stack.db.withoutTenant(
      'read payment for refund step',
      async (tx) =>
        tx
          .select({
            id: schema.payments.id,
            paymentIntentId: schema.payments.paymentIntentId,
            amount: schema.payments.amount,
          })
          .from(schema.payments)
          .where(sql`${schema.payments.orderId} = ${orderId}`),
    );

    const piId = existingPaymentRow?.paymentIntentId ?? `pi_fallback`;
    const chargeEventId = `evt_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

    const tenantRepoMock4 = makeTenantRepoMock({
      findByStripeAccountId: vi
        .fn()
        .mockResolvedValue(makeFakeTenantSnap(tenantId, `lifecycle-${tenantId.slice(0, 8)}`)),
    });

    const providerMock4: PaymentProviderPort = {
      ensureOnboardingAccount: vi.fn(),
      createOnboardingLink: vi.fn(),
      createOnboardingSession: vi.fn(),
      exchangeOAuthCode: vi.fn(),
      retrieveAccount: vi.fn(),
      createPaymentIntent: vi.fn(),
      cancelPaymentIntent: vi.fn(),
      createRefund: vi.fn(),
      verifyWebhookSignature: vi.fn(),
    };

    const orderRepo = new OrderDrizzleRepository(stack.db);

    const handlerService = new HandleStripeEventService(
      stack.db,
      tenantRepoMock4,
      orderRepo,
      paymentRepo,
      providerMock4,
    );

    // Real Stripe shape: charge.refunded carries amount_refunded (cumulative) and amount_captured,
    // but does NOT embed refunds.data inline — that is a sub-resource fetched separately.
    const chargeRefundedEvent = {
      id: chargeEventId,
      type: 'charge.refunded' as const,
      account: STRIPE_ACCOUNT_ID,
      data: {
        object: {
          id: `ch_test_refund_${randomUUID().replace(/-/g, '').slice(0, 8)}`,
          payment_intent: piId,
          amount_refunded: 1500,
          amount_captured: 1500,
          amount: 1500,
        },
      },
    };

    await handlerService.handle(chargeRefundedEvent);

    const [paymentRow] = await stack.db.withoutTenant(
      'verify payment status refunded',
      async (tx) =>
        tx
          .select({
            status: schema.payments.status,
            refundedAmount: schema.payments.refundedAmount,
          })
          .from(schema.payments)
          .where(sql`${schema.payments.orderId} = ${orderId}`),
    );

    expect(paymentRow?.status).toBe('refunded');
    expect(paymentRow?.refundedAmount).toBe('15.00');
  });

  it('operator cancel of an unpaid order persists status=canceled and emits ordering.order_canceled.v1', async () => {
    const seededOrderId = await seedOrder('created');
    const orderRepo = new OrderDrizzleRepository(stack.db);
    const paymentRepo = new PaymentDrizzleRepository(stack.db);

    const providerMock: PaymentProviderPort = {
      ensureOnboardingAccount: vi.fn(),
      createOnboardingLink: vi.fn(),
      createOnboardingSession: vi.fn(),
      exchangeOAuthCode: vi.fn(),
      retrieveAccount: vi.fn(),
      createPaymentIntent: vi.fn(),
      cancelPaymentIntent: vi.fn(),
      createRefund: vi
        .fn()
        .mockResolvedValue({ stripeRefundId: `re_${randomUUID()}`, status: 'succeeded' }),
      verifyWebhookSignature: vi.fn(),
    };

    const refundService = new RefundOrderService(orderRepo, paymentRepo, providerMock, stack.db);
    const cancelService = new CancelOrderService(orderRepo, refundService);

    await runInTenantContext({ tenantId }, () =>
      cancelService.execute({
        orderId: OrderId.parse(seededOrderId),
        tenantId: TenantId.parse(tenantId),
        reasonCode: 'guest_requested',
        cancelNote: 'guest changed mind',
        actorUserId: null,
      }),
    );

    expect(await readOrderStatus(seededOrderId)).toBe('canceled');
    expect(await readOutboxTypes(seededOrderId)).toContain('ordering.order_canceled.v1');
    expect(providerMock.createRefund).not.toHaveBeenCalled();
  });

  it('operator full refund of a paid order leaves order status paid and emits ordering.order_refunded.v1', async () => {
    const seededOrderId = await seedOrder('paid');
    await seedPayment(seededOrderId);
    const orderRepo = new OrderDrizzleRepository(stack.db);
    const paymentRepo = new PaymentDrizzleRepository(stack.db);

    const providerMock: PaymentProviderPort = {
      ensureOnboardingAccount: vi.fn(),
      createOnboardingLink: vi.fn(),
      createOnboardingSession: vi.fn(),
      exchangeOAuthCode: vi.fn(),
      retrieveAccount: vi.fn(),
      createPaymentIntent: vi.fn(),
      cancelPaymentIntent: vi.fn(),
      createRefund: vi
        .fn()
        .mockResolvedValue({ stripeRefundId: `re_${randomUUID()}`, status: 'succeeded' }),
      verifyWebhookSignature: vi.fn(),
    };

    const refundService = new RefundOrderService(orderRepo, paymentRepo, providerMock, stack.db);

    await runInTenantContext({ tenantId }, () =>
      refundService.execute({
        orderId: OrderId.parse(seededOrderId),
        tenantId: TenantId.parse(tenantId),
        reason: 'full refund requested',
      }),
    );

    expect(await readOrderStatus(seededOrderId)).toBe('paid');
    const outboxTypes = await readOutboxTypes(seededOrderId);
    expect(outboxTypes).toContain('ordering.order_refunded.v1');
    expect(outboxTypes).toContain('payments.order_refunded.v1');

    const [paymentRow] = await stack.db.withoutTenant('verify payment refunded', async (tx) =>
      tx
        .select({ status: schema.payments.status })
        .from(schema.payments)
        .where(sql`${schema.payments.orderId} = ${seededOrderId}`),
    );
    expect(paymentRow?.status).toBe('refunded');
  });

  it('operator cancel of a paid order persists the auto-refund transition (row no longer stuck at paid)', async () => {
    const seededOrderId = await seedOrder('paid');
    await seedPayment(seededOrderId);
    const orderRepo = new OrderDrizzleRepository(stack.db);
    const paymentRepo = new PaymentDrizzleRepository(stack.db);

    const providerMock: PaymentProviderPort = {
      ensureOnboardingAccount: vi.fn(),
      createOnboardingLink: vi.fn(),
      createOnboardingSession: vi.fn(),
      exchangeOAuthCode: vi.fn(),
      retrieveAccount: vi.fn(),
      createPaymentIntent: vi.fn(),
      cancelPaymentIntent: vi.fn(),
      createRefund: vi
        .fn()
        .mockResolvedValue({ stripeRefundId: `re_${randomUUID()}`, status: 'succeeded' }),
      verifyWebhookSignature: vi.fn(),
    };

    const refundService = new RefundOrderService(orderRepo, paymentRepo, providerMock, stack.db);
    const cancelService = new CancelOrderService(orderRepo, refundService);

    await runInTenantContext({ tenantId }, () =>
      cancelService.execute({
        orderId: OrderId.parse(seededOrderId),
        tenantId: TenantId.parse(tenantId),
        reasonCode: 'other',
        cancelNote: 'operator canceled paid order',
        actorUserId: null,
      }),
    );

    const status = await readOrderStatus(seededOrderId);
    expect(status).toBe('canceled');
    expect(status).not.toBe('paid');
    expect(await readOutboxTypes(seededOrderId)).toContain('ordering.order_refunded.v1');
  });
});
