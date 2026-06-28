import { describe, it, expect, vi } from 'vitest';
import { BrandId, Currency, TenantId } from '@resto/domain';
import type { OrderRepository } from '../../ordering/domain/ports';
import type { BrandRepository } from '../../tenancy/domain/ports';
import type { PaymentProviderPort, PaymentRepository, UpsertPaymentInput } from '../domain/ports';
import type { TenantAwareDb } from '@resto/db';
import { CreateCheckoutPaymentService } from './create-checkout-payment.service';
import {
  PaymentsNotEnabledError,
  CurrencyMismatchError,
  OrderNotCheckoutableError,
} from '../domain/errors';
import { Order } from '../../ordering/domain/order.aggregate';
import type { BrandSnapshot } from '../../tenancy/domain/brand.aggregate';
import type { OrderSnapshot } from '../../ordering/domain/order.aggregate';
import { OrderId } from '@resto/domain';
import { randomUUID } from 'node:crypto';

const makeBrandSnap = (overrides: Partial<BrandSnapshot> = {}): BrandSnapshot => ({
  id: BrandId.parse(randomUUID()),
  tenantId: TenantId.parse(randomUUID()),
  slug: 'test-brand',
  displayName: 'Test Restaurant',
  status: 'active',
  theme: null,
  paymentProvider: 'stripe',
  accountType: 'express',
  defaultCurrency: 'EUR',
  stripeAccountId: 'acct_test123',
  stripeChargesEnabled: true,
  stripePayoutsEnabled: true,
  stripeOnboardingStatus: 'complete',
  stripeRequirementsDue: null,
  ...overrides,
});

const makeOrderSnap = (brandId: string, overrides: Partial<OrderSnapshot> = {}): OrderSnapshot => ({
  id: OrderId.parse(randomUUID()),
  tenantId: TenantId.parse(randomUUID()),
  brandId,
  idempotencyKey: randomUUID(),
  orderNumber: 'ORD-001',
  status: 'created',
  fulfillmentMode: 'dine_in',
  tableIdentifier: 'A1',
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
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const buildSut = (brandSnapOverrides: Partial<BrandSnapshot> = {}) => {
  const brandSnap = makeBrandSnap(brandSnapOverrides);
  const orderSnap = makeOrderSnap(brandSnap.id);
  const tenantId = orderSnap.tenantId;

  const order = Order.fromSnapshot(orderSnap);

  const orderRepo: OrderRepository = {
    save: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(order),
    findByIdInTx: vi.fn().mockResolvedValue(null),
    findByIdempotencyKey: vi.fn().mockResolvedValue(null),
  };

  const brandRepo: BrandRepository = {
    findById: vi.fn().mockResolvedValue(brandSnap),
    findBySlug: vi.fn().mockResolvedValue(null),
    findByTenantAndSlug: vi.fn().mockResolvedValue(null),
    findByDomainHost: vi.fn().mockResolvedValue(null),
    listForTenant: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
    findActiveSlugsByPrefix: vi.fn().mockResolvedValue([]),
    findByStripeAccountId: vi.fn().mockResolvedValue(null),
    updatePaymentConnection: vi.fn().mockResolvedValue(undefined),
  };

  const paymentRepo: PaymentRepository = {
    findByPaymentIntentId: vi.fn().mockResolvedValue(null),
    findByOrderId: vi.fn().mockResolvedValue(null),
    upsertByPaymentIntentId: vi.fn().mockImplementation((input: UpsertPaymentInput) =>
      Promise.resolve({
        id: randomUUID(),
        tenantId: input.tenantId,
        orderId: input.orderId,
        status: input.status,
        amount: input.amount,
        currency: input.currency,
        paymentIntentId: input.paymentIntentId ?? null,
        latestChargeId: null,
        refundedAmount: '0.00',
        stripeAccountId: input.stripeAccountId ?? null,
        applicationFeeAmount: input.applicationFeeAmount ?? '0.00',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ),
    findRefundByStripeId: vi.fn().mockResolvedValue(null),
    upsertRefund: vi.fn().mockResolvedValue(null),
    updateRefundStatus: vi.fn().mockResolvedValue(undefined),
  };

  const provider: PaymentProviderPort = {
    ensureOnboardingAccount: vi.fn().mockResolvedValue({ accountId: 'acct_test123' }),
    createOnboardingLink: vi
      .fn()
      .mockResolvedValue({ url: 'https://stripe.com/link', expiresAt: 0 }),
    createOnboardingSession: vi.fn().mockResolvedValue({ clientSecret: 'cs_test' }),
    exchangeOAuthCode: vi.fn().mockResolvedValue({ accountId: 'acct_test123' }),
    retrieveAccount: vi.fn().mockResolvedValue({
      chargesEnabled: true,
      payoutsEnabled: true,
      requirementsDue: null,
    }),
    createPaymentIntent: vi.fn().mockResolvedValue({
      paymentIntentId: 'pi_test123',
      clientSecret: 'pi_test123_secret',
      status: 'requires_action',
    }),
    cancelPaymentIntent: vi.fn().mockResolvedValue({ status: 'canceled' }),
    createRefund: vi.fn().mockResolvedValue({ stripeRefundId: 'ref_test', status: 'succeeded' }),
    verifyWebhookSignature: vi
      .fn()
      .mockReturnValue({ id: 'evt_test', type: 'account.updated', data: {} }),
  };

  const _fakeTx = {} as unknown;
  const db = {
    withTenant: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(_fakeTx)),
    withoutTenant: vi
      .fn()
      .mockImplementation((_reason: unknown, fn: (tx: unknown) => Promise<unknown>) => fn(_fakeTx)),
  } as unknown as TenantAwareDb;

  const sut = new CreateCheckoutPaymentService(orderRepo, brandRepo, paymentRepo, provider, db, 0);

  return {
    sut,
    orderRepo,
    brandRepo,
    paymentRepo,
    provider,
    order,
    brandSnap,
    orderSnap,
    tenantId,
  };
};

describe('CreateCheckoutPaymentService', () => {
  describe('canAcceptPayments gate (D-07)', () => {
    it('throws PaymentsNotEnabledError when brand has no stripeAccountId', async () => {
      const { sut, orderSnap, tenantId } = buildSut({
        stripeAccountId: null,
        stripeChargesEnabled: false,
      });

      await expect(sut.execute({ orderId: orderSnap.id, tenantId })).rejects.toThrow(
        PaymentsNotEnabledError,
      );
    });

    it('throws PaymentsNotEnabledError when brand has account but chargesEnabled=false', async () => {
      const { sut, orderSnap, tenantId } = buildSut({
        stripeAccountId: 'acct_test123',
        stripeChargesEnabled: false,
      });

      await expect(sut.execute({ orderId: orderSnap.id, tenantId })).rejects.toThrow(
        PaymentsNotEnabledError,
      );
    });

    it('throws PaymentsNotEnabledError when brand has no defaultCurrency', async () => {
      const { sut, orderSnap, tenantId } = buildSut({
        defaultCurrency: null,
        stripeAccountId: 'acct_test123',
        stripeChargesEnabled: true,
      });

      await expect(sut.execute({ orderId: orderSnap.id, tenantId })).rejects.toThrow(
        PaymentsNotEnabledError,
      );
    });
  });

  describe('server-authoritative amount + currency (D-07, brand-level)', () => {
    it('creates PaymentIntent with server-computed order total in minor units', async () => {
      const { sut, provider, orderSnap, tenantId } = buildSut();

      await sut.execute({ orderId: orderSnap.id, tenantId });

      expect(provider.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ amountMinor: 1000 }),
      );
    });

    it('throws CurrencyMismatchError when order currency differs from brand settlement currency', async () => {
      const { sut, orderRepo, orderSnap, tenantId } = buildSut();
      const mismatchOrderSnap = makeOrderSnap(orderSnap.brandId, {
        tenantId,
        currency: Currency.parse('USD'),
        total: '10.00',
      });
      const mismatchOrder = Order.fromSnapshot(mismatchOrderSnap);
      vi.mocked(orderRepo.findById).mockResolvedValue(mismatchOrder);

      await expect(sut.execute({ orderId: mismatchOrderSnap.id, tenantId })).rejects.toThrow(
        CurrencyMismatchError,
      );
    });
  });

  describe('double-charge guard (D-06)', () => {
    it('cancels prior in-flight PaymentIntent before creating a new one', async () => {
      const { sut, paymentRepo, provider, orderSnap, tenantId } = buildSut();

      const existingPayment = {
        id: randomUUID(),
        tenantId,
        orderId: orderSnap.id,
        status: 'requires_action',
        amount: '10.00',
        currency: 'EUR',
        paymentIntentId: 'pi_existing',
        latestChargeId: null,
        refundedAmount: '0.00',
        stripeAccountId: 'acct_test123',
        applicationFeeAmount: '0.00',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(paymentRepo.findByOrderId).mockResolvedValue(existingPayment);

      await sut.execute({ orderId: orderSnap.id, tenantId });

      expect(provider.cancelPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ paymentIntentId: 'pi_existing' }),
      );
      expect(provider.createPaymentIntent).toHaveBeenCalledTimes(1);
    });

    it('uses incremented attempt in idempotency key on retry', async () => {
      const { sut, paymentRepo, provider, orderSnap, tenantId } = buildSut();

      const existingPayment = {
        id: randomUUID(),
        tenantId,
        orderId: orderSnap.id,
        status: 'requires_action',
        amount: '10.00',
        currency: 'EUR',
        paymentIntentId: 'pi_existing',
        latestChargeId: null,
        refundedAmount: '0.00',
        stripeAccountId: 'acct_test123',
        applicationFeeAmount: '0.00',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(paymentRepo.findByOrderId).mockResolvedValue(existingPayment);

      await sut.execute({ orderId: orderSnap.id, tenantId });

      expect(provider.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ attempt: 1 }),
      );
    });

    it('does not cancel when no prior PaymentIntent exists (first attempt)', async () => {
      const { sut, paymentRepo, provider, orderSnap, tenantId } = buildSut();
      vi.mocked(paymentRepo.findByOrderId).mockResolvedValue(null);

      await sut.execute({ orderId: orderSnap.id, tenantId });

      expect(provider.cancelPaymentIntent).not.toHaveBeenCalled();
      expect(provider.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ attempt: 0 }),
      );
    });
  });

  describe('order status transition + payment row (D-08)', () => {
    it('transitions order to requires_action and writes a payment row', async () => {
      const { sut, orderRepo, paymentRepo, orderSnap, tenantId } = buildSut();

      await sut.execute({ orderId: orderSnap.id, tenantId });

      expect(orderRepo.update).toHaveBeenCalledTimes(1);
      const savedOrder = vi.mocked(orderRepo.update).mock.calls[0]?.[0];
      expect(savedOrder?.toSnapshot().status).toBe('requires_action');

      expect(paymentRepo.upsertByPaymentIntentId).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'requires_action' }),
        expect.anything(),
      );
    });

    it('rejects an order that is already paid', async () => {
      const { sut, orderRepo, orderSnap, tenantId } = buildSut();
      const paidOrder = Order.fromSnapshot({ ...orderSnap, status: 'paid' });
      vi.mocked(orderRepo.findById).mockResolvedValue(paidOrder);

      await expect(sut.execute({ orderId: orderSnap.id, tenantId })).rejects.toThrow(
        OrderNotCheckoutableError,
      );
    });
  });

  describe('return shape', () => {
    it('returns clientSecret, connectedAccountId, and orderId', async () => {
      const { sut, orderSnap, tenantId } = buildSut();

      const result = await sut.execute({ orderId: orderSnap.id, tenantId });

      expect(result).toMatchObject({
        clientSecret: expect.any(String),
        connectedAccountId: expect.any(String),
        orderId: expect.any(String),
      });
    });
  });
});
