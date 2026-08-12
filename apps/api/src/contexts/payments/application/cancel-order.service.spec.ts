import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantAwareDb, RestoTx } from '@resto/db';
import { TenantId, OrderId, Currency } from '@resto/domain';
import { Order } from '../../ordering/domain/order.aggregate';
import type { OrderRepository } from '../../ordering/domain/ports';
import type { PaymentProviderPort } from '../domain/ports';
import type { PaymentRepository } from '../domain/ports';
import { CancelOrderService } from './cancel-order.service';
import { RefundOrderService } from './refund-order.service';
import { OrderNotFoundError } from '../../ordering/domain/errors';

const TENANT_ID = TenantId.parse('00000000-0000-0000-0000-000000000001');
const ORDER_ID = OrderId.parse('00000000-0000-0000-0000-000000000002');
const PAYMENT_ID = '00000000-0000-0000-0000-000000000010';
const PAYMENT_INTENT_ID = 'pi_test_abc123';
const STRIPE_ACCOUNT_ID = 'acct_test';

const makeTx = (): RestoTx => {
  const insertReturning = { returning: vi.fn().mockResolvedValue([{ id: 'outbox-id' }]) };
  const insertValues = { values: vi.fn().mockReturnValue(insertReturning) };
  const insert = vi.fn().mockReturnValue(insertValues);
  return { insert } as unknown as RestoTx;
};

const makeOrder = (status: string, total = '20.00') =>
  Order.fromSnapshot({
    id: ORDER_ID,
    tenantId: TENANT_ID,
    brandId: '00000000-0000-0000-0000-000000000003',
    locationId: '00000000-0000-0000-0000-000000000004',
    idempotencyKey: 'idem-key',
    orderNumber: 'ORD-001',
    status: status as Parameters<typeof Order.fromSnapshot>[0]['status'],
    fulfillmentMode: 'dine_in' as const,
    tableIdentifier: null,
    customerName: null,
    customerPhone: null,
    customerEmail: 'guest@example.com',
    items: [],
    subtotal: total,
    deliveryFee: '0.00',
    serviceFee: '0.00',
    discount: '0.00',
    total,
    currency: Currency.parse('EUR'),
    scheduledFor: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const makePaymentRow = (refundedAmount = '0.00') => ({
  id: PAYMENT_ID,
  tenantId: TENANT_ID,
  orderId: ORDER_ID,
  status: 'succeeded',
  amount: '20.00',
  currency: 'EUR',
  paymentIntentId: PAYMENT_INTENT_ID,
  latestChargeId: 'ch_test',
  refundedAmount,
  stripeAccountId: STRIPE_ACCOUNT_ID,
  applicationFeeAmount: '0.00',
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('CancelOrderService', () => {
  let service: CancelOrderService;
  let refundService: RefundOrderService;
  let orderRepo: { [K in keyof OrderRepository]: ReturnType<typeof vi.fn> };
  let paymentRepo: { [K in keyof PaymentRepository]: ReturnType<typeof vi.fn> };
  let provider: { [K in keyof PaymentProviderPort]: ReturnType<typeof vi.fn> };
  let db: { withTenant: ReturnType<typeof vi.fn> };

  beforeEach(() => {
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
      upsertByPaymentIntentId: vi.fn().mockResolvedValue(makePaymentRow()),
      findRefundByStripeId: vi.fn().mockResolvedValue(null),
      upsertRefund: vi.fn().mockResolvedValue({ id: 'refund-row-1' }),
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
      createRefund: vi
        .fn()
        .mockResolvedValue({ stripeRefundId: 're_test_cancel', status: 'succeeded' }),
      verifyWebhookSignature: vi.fn(),
    };

    db = {
      withTenant: vi
        .fn()
        .mockImplementation(async (fn: (tx: RestoTx) => Promise<unknown>) => fn(makeTx())),
    };

    refundService = new RefundOrderService(
      orderRepo,
      paymentRepo,
      provider,
      db as unknown as TenantAwareDb,
      new Logger('test'),
    );

    service = new CancelOrderService(orderRepo, refundService, new Logger('test'));
  });

  it('throws if order not found', async () => {
    orderRepo.findById.mockResolvedValue(null);
    await expect(
      service.execute({ orderId: ORDER_ID, tenantId: TENANT_ID, reason: 'not needed' }),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it('cancel of unpaid (created) order — no refund call', async () => {
    orderRepo.findById.mockResolvedValue(makeOrder('created'));
    await service.execute({ orderId: ORDER_ID, tenantId: TENANT_ID, reason: 'changed mind' });
    expect(provider.createRefund).not.toHaveBeenCalled();
    const savedOrder = orderRepo.update.mock.calls[0]?.[0] as Order;
    expect(savedOrder.toSnapshot().status).toBe('canceled');
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('cancel of paid order — auto-refunds full remaining captured amount once', async () => {
    orderRepo.findById.mockResolvedValue(makeOrder('paid', '20.00'));
    paymentRepo.findByOrderId.mockResolvedValue(makePaymentRow('0.00'));
    paymentRepo.upsertByPaymentIntentId.mockResolvedValue(makePaymentRow('20.00'));

    await service.execute({ orderId: ORDER_ID, tenantId: TENANT_ID, reason: 'order canceled' });

    expect(provider.createRefund).toHaveBeenCalledTimes(1);
    expect(provider.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentIntentId: PAYMENT_INTENT_ID,
        connectedAccountId: STRIPE_ACCOUNT_ID,
        amountMinor: 2000,
      }),
    );
    expect(paymentRepo.upsertRefund).toHaveBeenCalledTimes(1);
    const refundInput = paymentRepo.upsertRefund.mock.calls[0]?.[0] as {
      refundedAmount: string;
    };
    expect(refundInput).toBeDefined();
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('cancel of paid order with partial prior refund — refunds remaining only', async () => {
    orderRepo.findById.mockResolvedValue(makeOrder('paid', '20.00'));
    paymentRepo.findByOrderId.mockResolvedValue(makePaymentRow('5.00'));
    paymentRepo.upsertByPaymentIntentId.mockResolvedValue(makePaymentRow('20.00'));

    await service.execute({ orderId: ORDER_ID, tenantId: TENANT_ID, reason: 'order canceled' });

    expect(provider.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 1500 }),
    );
    expect(orderRepo.save).not.toHaveBeenCalled();
  });
});
