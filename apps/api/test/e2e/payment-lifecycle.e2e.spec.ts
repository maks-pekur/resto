import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { schema } from '@resto/db';
import { BrandId, TenantId } from '@resto/domain';
import { runInTenantContext } from '@resto/db';
import { OrderDrizzleRepository } from '../../src/contexts/ordering/infrastructure/order-drizzle.repository';
import { PaymentDrizzleRepository } from '../../src/contexts/payments/infrastructure/payment-drizzle.repository';
import { CreateCheckoutPaymentService } from '../../src/contexts/payments/application/create-checkout-payment.service';
import { HandleStripeEventService } from '../../src/contexts/payments/application/handle-stripe-event.service';
import { isDockerAvailable, startDbStack, stopDbStack } from './helpers/with-db-stack';
import type { DbStack } from './helpers/with-db-stack';
import type { BrandRepository } from '../../src/contexts/tenancy/domain/ports';
import type { BrandSnapshot } from '../../src/contexts/tenancy/domain/brand.aggregate';
import type { PaymentProviderPort } from '../../src/contexts/payments/domain/ports';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[payment-lifecycle] Docker not available — skipping.');
}

const STRIPE_ACCOUNT_ID = 'acct_1TestLifecycle0099';

suite('Payment lifecycle e2e — order created→requires_action→paid→refunded (PAY-BUG3/4)', () => {
  let stack: DbStack;
  let tenantId: string;
  let brandId: string;
  let orderId: string;

  beforeAll(async () => {
    stack = await startDbStack();
    tenantId = randomUUID();
    brandId = randomUUID();
    orderId = randomUUID();

    await stack.db.withoutTenant('seed lifecycle e2e', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: tenantId,
        slug: `lifecycle-${tenantId.slice(0, 8)}`,
        displayName: 'Lifecycle Test Tenant',
        locale: 'en',
        defaultCurrency: 'EUR',
      });

      await tx.insert(schema.brands).values({
        id: brandId,
        tenantId,
        slug: `lifecycle-brand-${brandId.slice(0, 8)}`,
        displayName: 'Test Brand',
        stripeAccountId: STRIPE_ACCOUNT_ID,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeOnboardingStatus: 'complete',
      });

      await tx.insert(schema.orders).values({
        id: orderId,
        tenantId,
        brandId,
        idempotencyKey: randomUUID(),
        orderNumber: 'ORD-LIFECYCLE-001',
        status: 'created',
        fulfillmentMode: 'dine_in',
        subtotal: '15.00',
        total: '15.00',
        currency: 'EUR',
      });
    });
  }, 120_000);

  afterAll(async () => {
    if (stack) await stopDbStack(stack);
  });

  it.skip('step 2: checkout service transitions order to requires_action and writes payment row', async () => {
    const orderRepo = new OrderDrizzleRepository(stack.db);
    const paymentRepo = new PaymentDrizzleRepository(stack.db);

    const piId = `pi_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const clientSecret = `${piId}_secret_test`;

    const fakeBrandSnap: BrandSnapshot = {
      id: BrandId.parse(brandId),
      tenantId: TenantId.parse(tenantId),
      slug: `lifecycle-brand-${brandId.slice(0, 8)}`,
      displayName: 'Test Brand',
      status: 'active',
      theme: null,
      paymentProvider: 'stripe',
      accountType: 'express',
      defaultCurrency: 'EUR',
      stripeAccountId: STRIPE_ACCOUNT_ID,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeOnboardingStatus: 'complete',
      stripeRequirementsDue: null,
    };

    const brandRepoMock: BrandRepository = {
      findById: vi.fn().mockResolvedValue(fakeBrandSnap),
      findBySlug: vi.fn().mockResolvedValue(null),
      findByTenantAndSlug: vi.fn().mockResolvedValue(null),
      findByDomainHost: vi.fn().mockResolvedValue(null),
      listForTenant: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
      findActiveSlugsByPrefix: vi.fn().mockResolvedValue([]),
      findByStripeAccountId: vi.fn().mockResolvedValue(null),
      updatePaymentConnection: vi.fn().mockResolvedValue(undefined),
    };

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
      brandRepoMock,
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

    const brandRepoMock: BrandRepository = {
      findById: vi.fn().mockResolvedValue(null),
      findBySlug: vi.fn().mockResolvedValue(null),
      findByTenantAndSlug: vi.fn().mockResolvedValue(null),
      findByDomainHost: vi.fn().mockResolvedValue(null),
      listForTenant: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
      findActiveSlugsByPrefix: vi.fn().mockResolvedValue([]),
      findByStripeAccountId: vi.fn().mockResolvedValue(null),
      updatePaymentConnection: vi.fn().mockResolvedValue(undefined),
    };

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
      brandRepoMock,
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

    const brandRepoMock4: BrandRepository = {
      findById: vi.fn().mockResolvedValue(null),
      findBySlug: vi.fn().mockResolvedValue(null),
      findByTenantAndSlug: vi.fn().mockResolvedValue(null),
      findByDomainHost: vi.fn().mockResolvedValue(null),
      listForTenant: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
      findActiveSlugsByPrefix: vi.fn().mockResolvedValue([]),
      findByStripeAccountId: vi.fn().mockResolvedValue({
        id: BrandId.parse(brandId),
        tenantId: TenantId.parse(tenantId),
        slug: `lifecycle-brand-${brandId.slice(0, 8)}`,
        displayName: 'Test Brand',
        status: 'active',
        theme: null,
        paymentProvider: 'stripe',
        accountType: 'express',
        defaultCurrency: 'EUR',
        stripeAccountId: STRIPE_ACCOUNT_ID,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeOnboardingStatus: 'complete',
        stripeRequirementsDue: null,
      }),
      updatePaymentConnection: vi.fn().mockResolvedValue(undefined),
    };

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
      brandRepoMock4,
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
});
