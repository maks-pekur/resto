import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantAwareDb, RestoTx } from '@resto/db';
import { BrandId, TenantId, OrderId, Currency } from '@resto/domain';
import type { RunDedupedResult } from '@resto/events';
import type { BrandRepository } from '../../tenancy/domain/ports';
import type { BrandSnapshot } from '../../tenancy/domain/brand.aggregate';
import type { OrderRepository } from '../../ordering/domain/ports';
import { Order } from '../../ordering/domain/order.aggregate';
import type { PaymentProviderPort, PaymentRepository } from '../domain/ports';
import { HandleStripeEventService } from './handle-stripe-event.service';

const TENANT_ID = TenantId.parse('00000000-0000-0000-0000-000000000001');
const BRAND_ID = BrandId.parse('00000000-0000-0000-0000-000000000009');
const ORDER_ID = '00000000-0000-0000-0000-000000000002';
const PAYMENT_INTENT_ID = 'pi_test_abc123';
const CHARGE_ID = 'ch_test_xyz789';
const STRIPE_ACCOUNT_ID = 'acct_test_connected';
const CONNECTED_ACCOUNT_ID = 'acct_test_connected';

const makeTx = (): RestoTx => {
  const insertReturning = { returning: vi.fn().mockResolvedValue([{ id: 'outbox-id' }]) };
  const insertValues = { values: vi.fn().mockReturnValue(insertReturning) };
  const insert = vi.fn().mockReturnValue(insertValues);
  return { insert } as unknown as RestoTx;
};

const makeOrder = (status: string): Order => {
  const snap = {
    id: OrderId.parse(ORDER_ID),
    tenantId: TENANT_ID,
    brandId: BRAND_ID,
    locationId: '00000000-0000-0000-0000-000000000004',
    idempotencyKey: 'idem-key',
    orderNumber: 'ORD-001',
    status,
    fulfillmentMode: 'dine_in' as const,
    tableIdentifier: null,
    customerName: null,
    customerPhone: null,
    customerEmail: 'guest@example.com',
    items: [],
    subtotal: '10.00',
    deliveryFee: '0.00',
    serviceFee: '0.00',
    discount: '0.00',
    total: '10.00',
    currency: Currency.parse('EUR'),
    scheduledFor: null,
    shortNumber: null,
    channel: 'site' as const,
    acceptedAt: null,
    preparingAt: null,
    readyAt: null,
    completedAt: null,
    canceledAt: null,
    acceptedByUserId: null,
    canceledByUserId: null,
    cancelReason: null,
    cancelNote: null,
    canceledFromStatus: null,
    etaAt: null,
    marketingConsent: false,
    marketingConsentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return Order.fromSnapshot(snap as Parameters<typeof Order.fromSnapshot>[0]);
};

const makeBrandSnap = (
  overrides: {
    stripeAccountId?: string | null;
    chargesEnabled?: boolean;
    payoutsEnabled?: boolean;
  } = {},
): BrandSnapshot => ({
  id: BRAND_ID,
  tenantId: TENANT_ID,
  slug: 'test-brand',
  displayName: 'Test Brand',
  status: 'active',
  theme: null,
  paymentProvider: 'stripe',
  accountType: 'express',
  defaultCurrency: 'EUR',
  stripeAccountId: overrides.stripeAccountId ?? STRIPE_ACCOUNT_ID,
  stripeChargesEnabled: overrides.chargesEnabled ?? false,
  stripePayoutsEnabled: overrides.payoutsEnabled ?? false,
  stripeOnboardingStatus: 'pending',
  stripeRequirementsDue: null,
});

const makePaymentRow = (overrides: Record<string, unknown> = {}) => ({
  id: '00000000-0000-0000-0000-000000000010',
  tenantId: TENANT_ID,
  orderId: ORDER_ID,
  status: 'pending',
  amount: '10.00',
  currency: 'EUR',
  paymentIntentId: PAYMENT_INTENT_ID,
  latestChargeId: null,
  refundedAmount: '0.00',
  stripeAccountId: CONNECTED_ACCOUNT_ID,
  applicationFeeAmount: '0.00',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeStripeEvent = (type: string, dataObject: Record<string, unknown>, account?: string) => ({
  id: `evt_${type.replace(/\./g, '_')}_test`,
  type,
  account,
  data: { object: dataObject },
});

describe('HandleStripeEventService', () => {
  let service: HandleStripeEventService;
  let brandRepo: { [K in keyof BrandRepository]: ReturnType<typeof vi.fn> };
  let orderRepo: { [K in keyof OrderRepository]: ReturnType<typeof vi.fn> };
  let paymentRepo: { [K in keyof PaymentRepository]: ReturnType<typeof vi.fn> };
  let provider: { [K in keyof PaymentProviderPort]: ReturnType<typeof vi.fn> };
  let db: { withoutTenant: ReturnType<typeof vi.fn> };
  let runDedupedMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    brandRepo = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      findByTenantAndSlug: vi.fn(),
      findByDomainHost: vi.fn(),
      listForTenant: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      findActiveSlugsByPrefix: vi.fn(),
      findByStripeAccountId: vi.fn(),
      updatePaymentConnection: vi.fn().mockResolvedValue(undefined),
    };

    orderRepo = {
      save: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn(),
      findByIdInTx: vi.fn(),
      findByIdempotencyKey: vi.fn(),
    };

    paymentRepo = {
      findByPaymentIntentId: vi.fn(),
      findByOrderId: vi.fn(),
      upsertByPaymentIntentId: vi.fn(),
      findRefundByStripeId: vi.fn(),
      upsertRefund: vi.fn(),
      updateRefundStatus: vi.fn().mockResolvedValue(undefined),
    };

    provider = {
      ensureOnboardingAccount: vi.fn(),
      createOnboardingLink: vi.fn(),
      createOnboardingSession: vi.fn(),
      exchangeOAuthCode: vi.fn(),
      retrieveAccount: vi.fn(),
      createPaymentIntent: vi.fn(),
      cancelPaymentIntent: vi.fn(),
      createRefund: vi.fn().mockResolvedValue({ stripeRefundId: 're_orphan', status: 'succeeded' }),
      verifyWebhookSignature: vi.fn(),
    };

    runDedupedMock = vi
      .fn()
      .mockImplementation(
        async (
          _db: TenantAwareDb,
          _envelope: unknown,
          _consumer: string,
          handler: (tx: RestoTx) => Promise<void>,
        ): Promise<RunDedupedResult> => {
          const tx = makeTx();
          await handler(tx);
          return 'executed';
        },
      );

    db = {
      withoutTenant: vi.fn(),
    };

    service = new HandleStripeEventService(
      db as unknown as TenantAwareDb,
      brandRepo,
      orderRepo,
      paymentRepo,
      provider,
      new Logger('test'),
      runDedupedMock,
    );
  });

  describe('payment_intent.succeeded', () => {
    const piObject = {
      id: PAYMENT_INTENT_ID,
      latest_charge: CHARGE_ID,
      amount: 1000,
      currency: 'eur',
      metadata: { orderId: ORDER_ID, tenantId: TENANT_ID },
    };

    it('transitions order to paid when status is created', async () => {
      const order = makeOrder('created');
      orderRepo.findByIdInTx.mockResolvedValue(order);
      paymentRepo.findByPaymentIntentId.mockResolvedValue(null);
      paymentRepo.upsertByPaymentIntentId.mockResolvedValue(
        makePaymentRow({ status: 'succeeded', latestChargeId: CHARGE_ID }),
      );

      const event = makeStripeEvent('payment_intent.succeeded', piObject);
      await service.handle(event);

      expect(orderRepo.update).toHaveBeenCalled();
      const updatedOrder = (orderRepo.update.mock.calls[0] as [Order])[0];
      expect(updatedOrder.toSnapshot().status).toBe('paid');
      expect(paymentRepo.upsertByPaymentIntentId).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'succeeded', latestChargeId: CHARGE_ID }),
        expect.anything(),
      );
    });

    it('is idempotent: same event replayed returns skipped without state change', async () => {
      runDedupedMock.mockResolvedValueOnce('skipped');

      const event = makeStripeEvent('payment_intent.succeeded', piObject);
      await service.handle(event);

      expect(orderRepo.update).not.toHaveBeenCalled();
    });

    it('double-charge guard: orphan PI on already-paid order triggers auto-refund', async () => {
      const paidOrder = makeOrder('paid');
      orderRepo.findByIdInTx.mockResolvedValue(paidOrder);
      paymentRepo.findByPaymentIntentId.mockResolvedValue(null);
      paymentRepo.findByOrderId.mockResolvedValue(
        makePaymentRow({ paymentIntentId: 'pi_other_existing', status: 'succeeded' }),
      );
      paymentRepo.upsertByPaymentIntentId.mockResolvedValue(makePaymentRow({ status: 'orphan' }));

      const event = makeStripeEvent('payment_intent.succeeded', {
        ...piObject,
        metadata: { orderId: ORDER_ID, tenantId: TENANT_ID },
      });
      await service.handle(event);

      expect(orderRepo.update).not.toHaveBeenCalled();
      expect(provider.createRefund).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentIntentId: PAYMENT_INTENT_ID,
          refundRequestId: expect.stringContaining('orphan:'),
        }),
      );
    });
  });

  describe('payment_intent.payment_failed', () => {
    it('records failure without clobbering a paid order', async () => {
      const paidOrder = makeOrder('paid');
      orderRepo.findById.mockResolvedValue(paidOrder);
      paymentRepo.upsertByPaymentIntentId.mockResolvedValue(makePaymentRow({ status: 'failed' }));

      const event = makeStripeEvent('payment_intent.payment_failed', {
        id: PAYMENT_INTENT_ID,
        last_payment_error: { code: 'card_declined' },
        metadata: { orderId: ORDER_ID, tenantId: TENANT_ID },
      });
      await service.handle(event);

      expect(paymentRepo.upsertByPaymentIntentId).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
        expect.anything(),
      );
      expect(orderRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('account.updated', () => {
    const accountObj = {
      id: STRIPE_ACCOUNT_ID,
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      requirements: { currently_due: [] },
    };

    it('syncs capability flags when brand is known', async () => {
      const brandSnap = makeBrandSnap();
      brandRepo.findByStripeAccountId.mockResolvedValue(brandSnap);

      const event = makeStripeEvent('account.updated', accountObj, STRIPE_ACCOUNT_ID);
      await service.handle(event);

      expect(brandRepo.updatePaymentConnection).toHaveBeenCalled();
    });

    it('W3: unknown account is a no-op — no throw, no DB write', async () => {
      brandRepo.findByStripeAccountId.mockResolvedValue(null);

      const event = makeStripeEvent('account.updated', accountObj, 'acct_unknown');
      await expect(service.handle(event as never)).resolves.toBeUndefined();
      expect(brandRepo.updatePaymentConnection).not.toHaveBeenCalled();
      expect(runDedupedMock).not.toHaveBeenCalled();
    });
  });

  describe('charge.refunded (BUG-6)', () => {
    it('BUG-6 (b): real Stripe shape — no refunds.data — still flips payment status to refunded', async () => {
      const brandSnap = makeBrandSnap();
      brandRepo.findByStripeAccountId.mockResolvedValue(brandSnap);
      paymentRepo.findByPaymentIntentId.mockResolvedValue(
        makePaymentRow({ status: 'succeeded', amount: '10.00' }),
      );
      paymentRepo.upsertByPaymentIntentId.mockResolvedValue(makePaymentRow({ status: 'refunded' }));

      const chargeObj = {
        id: CHARGE_ID,
        payment_intent: PAYMENT_INTENT_ID,
        amount_refunded: 1000,
        amount_captured: 1000,
        amount: 1000,
      };
      const event = makeStripeEvent('charge.refunded', chargeObj, STRIPE_ACCOUNT_ID);
      await service.handle(event);

      expect(runDedupedMock).toHaveBeenCalled();
      expect(paymentRepo.upsertByPaymentIntentId).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'refunded' }),
        expect.anything(),
      );
    });

    it('BUG-6 (b): partial charge.refunded flips payment status to partially_refunded', async () => {
      const brandSnap = makeBrandSnap();
      brandRepo.findByStripeAccountId.mockResolvedValue(brandSnap);
      paymentRepo.findByPaymentIntentId.mockResolvedValue(
        makePaymentRow({ status: 'succeeded', amount: '10.00' }),
      );
      paymentRepo.upsertByPaymentIntentId.mockResolvedValue(
        makePaymentRow({ status: 'partially_refunded' }),
      );

      const chargeObj = {
        id: CHARGE_ID,
        payment_intent: PAYMENT_INTENT_ID,
        amount_refunded: 500,
        amount_captured: 1000,
        amount: 1000,
      };
      const event = makeStripeEvent('charge.refunded', chargeObj, STRIPE_ACCOUNT_ID);
      await service.handle(event);

      expect(paymentRepo.upsertByPaymentIntentId).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'partially_refunded' }),
        expect.anything(),
      );
    });

    it('BUG-6 (b): charge.refunded with inline refunds.data still flips status', async () => {
      const brandSnap = makeBrandSnap();
      brandRepo.findByStripeAccountId.mockResolvedValue(brandSnap);
      paymentRepo.findByPaymentIntentId.mockResolvedValue(
        makePaymentRow({ status: 'succeeded', amount: '10.00' }),
      );
      paymentRepo.upsertByPaymentIntentId.mockResolvedValue(makePaymentRow({ status: 'refunded' }));

      const chargeObj = {
        id: CHARGE_ID,
        payment_intent: PAYMENT_INTENT_ID,
        amount_refunded: 1000,
        amount_captured: 1000,
        amount: 1000,
        refunds: { data: [{ id: 're_abc', amount: 1000, status: 'succeeded' }] },
      };
      const event = makeStripeEvent('charge.refunded', chargeObj, STRIPE_ACCOUNT_ID);
      await service.handle(event);

      expect(paymentRepo.upsertByPaymentIntentId).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'refunded' }),
        expect.anything(),
      );
    });
  });

  describe('charge.dispute.created', () => {
    it('records dispute and appends dispute_opened event', async () => {
      const disputeObj = {
        id: 'dp_test_dispute',
        payment_intent: PAYMENT_INTENT_ID,
        amount: 1000,
        reason: 'fraudulent',
        charge: CHARGE_ID,
      };
      const brandSnap = makeBrandSnap();
      brandRepo.findByStripeAccountId.mockResolvedValue(brandSnap);
      paymentRepo.findByPaymentIntentId.mockResolvedValue(makePaymentRow());

      const event = makeStripeEvent('charge.dispute.created', disputeObj, STRIPE_ACCOUNT_ID);
      await service.handle(event);

      expect(runDedupedMock).toHaveBeenCalled();
    });
  });
});
