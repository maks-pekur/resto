import { describe, it, expect, vi } from 'vitest';
import { Currency, TenantId } from '@resto/domain';
import type { OrderRepository } from '../../ordering/domain/ports';
import type { TenantRepository, StripeConnectPort } from '../../tenancy/domain/ports';
import type { PaymentRepository, UpsertPaymentInput } from '../domain/ports';
import type { TenantAwareDb } from '@resto/db';
import { CreateCheckoutPaymentService } from './create-checkout-payment.service';
import {
  PaymentsNotEnabledError,
  CurrencyMismatchError,
  OrderNotCheckoutableError,
} from '../domain/errors';
import { Order } from '../../ordering/domain/order.aggregate';
import { Tenant } from '../../tenancy/domain/tenant.aggregate';
import type { OrderSnapshot } from '../../ordering/domain/order.aggregate';
import type { TenantSnapshot } from '../../tenancy/domain/tenant.aggregate';
import { TenantSlug, OrderId } from '@resto/domain';
import { randomUUID } from 'node:crypto';

const makeOrderSnap = (overrides: Partial<OrderSnapshot> = {}): OrderSnapshot => ({
  id: OrderId.parse(randomUUID()),
  tenantId: TenantId.parse(randomUUID()),
  brandId: randomUUID(),
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

const makeTenantSnap = (overrides: Partial<TenantSnapshot> = {}): TenantSnapshot => {
  const id = TenantId.parse(randomUUID());
  return {
    id,
    slug: TenantSlug.parse('test-tenant'),
    displayName: 'Test Restaurant',
    status: 'active',
    locale: 'en',
    defaultCurrency: Currency.parse('EUR'),
    stripeAccountId: 'acct_test123',
    stripeChargesEnabled: true,
    stripePayoutsEnabled: true,
    stripeOnboardingStatus: 'complete',
    stripeRequirementsDue: null,
    primaryDomain: {
      id: randomUUID(),
      tenantId: id,
      domain: 'test.menu.resto.app',
      kind: 'subdomain' as const,
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
    ...overrides,
  };
};

const buildSut = () => {
  const tenantId = TenantId.parse(randomUUID());
  const orderSnap = makeOrderSnap({ tenantId });
  const tenantSnap = makeTenantSnap({ id: tenantId });

  const order = Order.fromSnapshot(orderSnap);
  const tenant = Tenant.fromSnapshot(tenantSnap);

  const orderRepo: OrderRepository = {
    save: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(order),
    findByIdInTx: vi.fn().mockResolvedValue(null),
    findByIdempotencyKey: vi.fn().mockResolvedValue(null),
  };

  const tenantRepo: TenantRepository = {
    findById: vi.fn().mockResolvedValue(tenant),
    findBySlug: vi.fn().mockResolvedValue(null),
    findByDomainHost: vi.fn().mockResolvedValue(null),
    findByStripeAccountId: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    listDomains: vi.fn().mockResolvedValue([]),
    findCurrentTenant: vi.fn().mockResolvedValue(tenant),
    listCurrentTenantDomains: vi.fn().mockResolvedValue([]),
    eraseTenant: vi.fn().mockResolvedValue(tenantSnap),
    listScheduledForErasure: vi.fn().mockResolvedValue([]),
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

  const stripePort: StripeConnectPort = {
    ensureExpressAccount: vi.fn().mockResolvedValue(null),
    createExpressAccount: vi.fn().mockResolvedValue({ accountId: 'acct_test123' }),
    createAccountLink: vi.fn().mockResolvedValue({ url: 'https://stripe.com/link', expiresAt: 0 }),
    createPaymentIntent: vi.fn().mockResolvedValue({
      paymentIntentId: 'pi_test123',
      clientSecret: 'pi_test123_secret',
      status: 'requires_action',
    }),
    cancelPaymentIntent: vi.fn().mockResolvedValue({ status: 'canceled' }),
    createRefund: vi.fn().mockResolvedValue({ stripeRefundId: 'ref_test', status: 'succeeded' }),
    retrieveAccount: vi.fn().mockResolvedValue({
      chargesEnabled: true,
      payoutsEnabled: true,
      requirementsDue: null,
    }),
  };

  const fakeTx = {} as unknown;
  const db = {
    withTenant: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx)),
    withoutTenant: vi
      .fn()
      .mockImplementation((_reason: unknown, fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx)),
  } as unknown as TenantAwareDb;

  const sut = new CreateCheckoutPaymentService(
    orderRepo,
    tenantRepo,
    paymentRepo,
    stripePort,
    db,
    0,
  );

  return {
    sut,
    orderRepo,
    tenantRepo,
    paymentRepo,
    stripePort,
    order,
    tenant,
    orderSnap,
    tenantSnap,
    tenantId,
  };
};

describe('CreateCheckoutPaymentService', () => {
  describe('canAcceptPayments gate (D-12)', () => {
    it('throws PaymentsNotEnabledError when tenant cannot accept payments', async () => {
      const { sut, tenantRepo, tenantSnap, tenantId, stripePort } = buildSut();
      const disabledTenant = Tenant.fromSnapshot({
        ...tenantSnap,
        id: tenantId,
        stripeAccountId: null,
        stripeChargesEnabled: false,
      });
      vi.mocked(tenantRepo.findById).mockResolvedValue(disabledTenant);

      await expect(sut.execute({ orderId: randomUUID(), tenantId })).rejects.toThrow(
        PaymentsNotEnabledError,
      );

      expect(stripePort.createPaymentIntent).not.toHaveBeenCalled();
    });

    it('throws PaymentsNotEnabledError when stripeAccountId is null', async () => {
      const { sut, tenantRepo, tenantSnap, tenantId, stripePort } = buildSut();
      const disabledTenant = Tenant.fromSnapshot({
        ...tenantSnap,
        id: tenantId,
        stripeAccountId: null,
        stripeChargesEnabled: true,
      });
      vi.mocked(tenantRepo.findById).mockResolvedValue(disabledTenant);

      await expect(sut.execute({ orderId: randomUUID(), tenantId })).rejects.toThrow(
        PaymentsNotEnabledError,
      );

      expect(stripePort.createPaymentIntent).not.toHaveBeenCalled();
    });
  });

  describe('server-authoritative amount + currency (D-05, T-08-19)', () => {
    it('creates PaymentIntent with server-computed order total in minor units', async () => {
      const { sut, stripePort, orderSnap, tenantId } = buildSut();

      await sut.execute({ orderId: orderSnap.id, tenantId });

      expect(stripePort.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ amountMinor: 1000 }),
      );
    });

    it('throws CurrencyMismatchError when order currency differs from tenant settlement currency', async () => {
      const { sut, orderRepo, tenantId } = buildSut();
      const mismatchOrderSnap = makeOrderSnap({
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
      const { sut, paymentRepo, stripePort, orderSnap, tenantSnap, tenantId } = buildSut();

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
        stripeAccountId: tenantSnap.stripeAccountId,
        applicationFeeAmount: '0.00',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(paymentRepo.findByOrderId).mockResolvedValue(existingPayment);

      await sut.execute({ orderId: orderSnap.id, tenantId });

      expect(stripePort.cancelPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ paymentIntentId: 'pi_existing' }),
      );
      expect(stripePort.createPaymentIntent).toHaveBeenCalledTimes(1);
    });

    it('uses incremented attempt in idempotency key on retry', async () => {
      const { sut, paymentRepo, stripePort, orderSnap, tenantSnap, tenantId } = buildSut();

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
        stripeAccountId: tenantSnap.stripeAccountId,
        applicationFeeAmount: '0.00',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(paymentRepo.findByOrderId).mockResolvedValue(existingPayment);

      await sut.execute({ orderId: orderSnap.id, tenantId });

      expect(stripePort.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ attempt: 1 }),
      );
    });

    it('does not cancel when no prior PaymentIntent exists (first attempt)', async () => {
      const { sut, paymentRepo, stripePort, orderSnap, tenantId } = buildSut();
      vi.mocked(paymentRepo.findByOrderId).mockResolvedValue(null);

      await sut.execute({ orderId: orderSnap.id, tenantId });

      expect(stripePort.cancelPaymentIntent).not.toHaveBeenCalled();
      expect(stripePort.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ attempt: 0 }),
      );
    });
  });

  describe('order status transition + payment row (D-08)', () => {
    it('transitions order to requires_action and writes a payment row', async () => {
      const { sut, orderRepo, paymentRepo, orderSnap, tenantId } = buildSut();

      await sut.execute({ orderId: orderSnap.id, tenantId });

      expect(orderRepo.update).toHaveBeenCalledTimes(1);
      const updatedOrder = vi.mocked(orderRepo.update).mock.calls[0]?.[0];
      expect(updatedOrder?.toSnapshot().status).toBe('requires_action');

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
