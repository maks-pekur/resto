import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { schema } from '@resto/db';
import { Currency, TenantId, TenantSlug } from '@resto/domain';
import { runInTenantContext } from '@resto/db';
import { Tenant } from '../../src/contexts/tenancy/domain/tenant.aggregate';
import { OrderDrizzleRepository } from '../../src/contexts/ordering/infrastructure/order-drizzle.repository';
import { PaymentDrizzleRepository } from '../../src/contexts/payments/infrastructure/payment-drizzle.repository';
import { CreateCheckoutPaymentService } from '../../src/contexts/payments/application/create-checkout-payment.service';
import { HandleStripeEventService } from '../../src/contexts/payments/application/handle-stripe-event.service';
import { isDockerAvailable, startDbStack, stopDbStack } from './helpers/with-db-stack';
import type { DbStack } from './helpers/with-db-stack';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[payment-lifecycle] Docker not available — skipping.');
}

const STRIPE_ACCOUNT_ID = 'acct_1TestLifecycle0099';

const makeFakeTenant = (tenantId: string, stripeChargesEnabled = true): Tenant =>
  Tenant.fromSnapshot({
    id: TenantId.parse(tenantId),
    slug: TenantSlug.parse(`lifecycle-${tenantId.slice(0, 8)}`),
    displayName: 'Lifecycle Test Tenant',
    status: 'active',
    locale: 'en',
    defaultCurrency: Currency.parse('EUR'),
    stripeAccountId: STRIPE_ACCOUNT_ID,
    stripeChargesEnabled,
    stripePayoutsEnabled: true,
    stripeOnboardingStatus: 'complete',
    stripeRequirementsDue: null,
    primaryDomain: {
      id: randomUUID(),
      tenantId: TenantId.parse(tenantId),
      domain: `lifecycle-${tenantId.slice(0, 8)}.menu.resto.app`,
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
        stripeAccountId: STRIPE_ACCOUNT_ID,
      });

      await tx.insert(schema.brands).values({
        id: brandId,
        tenantId,
        slug: `lifecycle-brand-${brandId.slice(0, 8)}`,
        displayName: 'Test Brand',
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

  it('step 2: checkout service transitions order to requires_action and writes payment row (BUG-4 update path)', async () => {
    const orderRepo = new OrderDrizzleRepository(stack.db);
    const paymentRepo = new PaymentDrizzleRepository(stack.db);

    const piId = `pi_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const clientSecret = `${piId}_secret_test`;

    const fakeTenant = makeFakeTenant(tenantId);

    const tenantRepoMock = {
      findById: vi.fn().mockResolvedValue(fakeTenant),
      findBySlug: vi.fn().mockResolvedValue(null),
      findByDomainHost: vi.fn().mockResolvedValue(null),
      findByStripeAccountId: vi.fn().mockResolvedValue(fakeTenant),
      findCurrentTenant: vi.fn().mockResolvedValue(fakeTenant),
      listCurrentTenantDomains: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
      listDomains: vi.fn().mockResolvedValue([]),
      eraseTenant: vi.fn(),
      listScheduledForErasure: vi.fn().mockResolvedValue([]),
    };

    const stripePortMock = {
      ensureExpressAccount: vi.fn().mockResolvedValue(STRIPE_ACCOUNT_ID),
      createExpressAccount: vi.fn(),
      createAccountLink: vi.fn(),
      createPaymentIntent: vi.fn().mockResolvedValue({
        paymentIntentId: piId,
        clientSecret,
        status: 'requires_payment_method',
      }),
      cancelPaymentIntent: vi.fn().mockResolvedValue({ status: 'canceled' }),
      createRefund: vi.fn(),
      retrieveAccount: vi.fn(),
    };

    const checkoutService = new CreateCheckoutPaymentService(
      orderRepo,
      tenantRepoMock,
      paymentRepo,
      stripePortMock,
      stack.db,
      0,
    );

    const result = await runInTenantContext({ tenantId }, () =>
      checkoutService.execute({ orderId, tenantId: TenantId.parse(tenantId) }),
    );

    expect(result.clientSecret).toBe(clientSecret);
    expect(result.connectedAccountId).toBe(STRIPE_ACCOUNT_ID);

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

    const fakeTenant = makeFakeTenant(tenantId);

    const tenantRepoMock = {
      findById: vi.fn().mockResolvedValue(fakeTenant),
      findBySlug: vi.fn().mockResolvedValue(null),
      findByDomainHost: vi.fn().mockResolvedValue(null),
      findByStripeAccountId: vi.fn().mockResolvedValue(fakeTenant),
      findCurrentTenant: vi.fn().mockResolvedValue(fakeTenant),
      listCurrentTenantDomains: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
      listDomains: vi.fn().mockResolvedValue([]),
      eraseTenant: vi.fn(),
      listScheduledForErasure: vi.fn().mockResolvedValue([]),
    };

    const stripePortMock = {
      ensureExpressAccount: vi.fn(),
      createExpressAccount: vi.fn(),
      createAccountLink: vi.fn(),
      createPaymentIntent: vi.fn(),
      cancelPaymentIntent: vi.fn(),
      createRefund: vi.fn(),
      retrieveAccount: vi.fn(),
    };

    const handlerService = new HandleStripeEventService(
      stack.db,
      tenantRepoMock,
      orderRepo,
      paymentRepo,
      stripePortMock,
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
    await handlerService.handle(piSucceededEvent as never);

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

    await handlerService.handle(piSucceededEvent as never);

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

  it('step 4: charge.refunded writes payment_refunds row (refund path)', async () => {
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
    const refundId = `re_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const chargeEventId = `evt_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

    const fakeTenant = makeFakeTenant(tenantId);

    const tenantRepoMock = {
      findById: vi.fn().mockResolvedValue(fakeTenant),
      findBySlug: vi.fn().mockResolvedValue(null),
      findByDomainHost: vi.fn().mockResolvedValue(null),
      findByStripeAccountId: vi.fn().mockResolvedValue(fakeTenant),
      findCurrentTenant: vi.fn().mockResolvedValue(fakeTenant),
      listCurrentTenantDomains: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
      listDomains: vi.fn().mockResolvedValue([]),
      eraseTenant: vi.fn(),
      listScheduledForErasure: vi.fn().mockResolvedValue([]),
    };

    const stripePortMock = {
      ensureExpressAccount: vi.fn(),
      createExpressAccount: vi.fn(),
      createAccountLink: vi.fn(),
      createPaymentIntent: vi.fn(),
      cancelPaymentIntent: vi.fn(),
      createRefund: vi.fn(),
      retrieveAccount: vi.fn(),
    };

    const orderRepo = new OrderDrizzleRepository(stack.db);

    const handlerService = new HandleStripeEventService(
      stack.db,
      tenantRepoMock,
      orderRepo,
      paymentRepo,
      stripePortMock,
    );

    const chargeRefundedEvent = {
      id: chargeEventId,
      type: 'charge.refunded' as const,
      account: STRIPE_ACCOUNT_ID,
      data: {
        object: {
          id: `ch_test_refund_${randomUUID().replace(/-/g, '').slice(0, 8)}`,
          payment_intent: piId,
          refunds: {
            data: [
              {
                id: refundId,
                amount: 1500,
                status: 'succeeded',
              },
            ],
          },
        },
      },
    };

    await handlerService.handle(chargeRefundedEvent as never);

    const refundRows = await stack.db.withoutTenant('verify refund row', async (tx) =>
      tx
        .select({
          stripeRefundId: schema.paymentRefunds.stripeRefundId,
          status: schema.paymentRefunds.status,
        })
        .from(schema.paymentRefunds)
        .where(sql`${schema.paymentRefunds.stripeRefundId} = ${refundId}`),
    );

    expect(refundRows).toHaveLength(1);
    expect(refundRows[0]?.status).toBe('succeeded');
    expect(refundRows[0]?.stripeRefundId).toBe(refundId);
  });
});
