import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantAwareDb, RestoTx } from '@resto/db';
import { TenantId, OrderId, Currency } from '@resto/domain';
import { Order } from '../../ordering/domain/order.aggregate';
import type { OrderRepository } from '../../ordering/domain/ports';
import type { PaymentProviderPort } from '../domain/ports';
import type { PaymentRepository } from '../domain/ports';
import { RefundOrderService } from './refund-order.service';
import {
  RefundReasonRequiredError,
  PaymentNotRefundableError,
  RefundProviderFailedError,
} from '../domain/errors';
import { RefundExceedsCapturedError } from '../../ordering/domain/errors';

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
    locationId: '00000000-0000-0000-0000-000000000004',
    idempotencyKey: 'idem-key',
    orderNumber: 'ORD-001',
    status: status as Parameters<typeof Order.fromSnapshot>[0]['status'],
    orderType: 'dine_in' as const,
    tableIdentifier: null,
    tableId: null,
    tableZoneName: null,
    tableNumber: null,
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
    shortNumber: 1,
    paymentType: 'online',
    paymentStatus: 'pending',
    paidAt: null,
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

describe('RefundOrderService', () => {
  let service: RefundOrderService;
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
      findRefundByRequestId: vi.fn().mockResolvedValue(null),
      upsertRefund: vi.fn().mockResolvedValue({ id: 'refund-row-1' }),
      updateRefundOutcome: vi.fn().mockResolvedValue(undefined),
      updateRefundStatusByStripeId: vi.fn().mockResolvedValue(undefined),
      findFailedRefundsForOrders: vi.fn().mockResolvedValue([]),
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
        .mockResolvedValue({ stripeRefundId: 're_test_123', status: 'succeeded' }),
      verifyWebhookSignature: vi.fn(),
    };

    db = {
      withTenant: vi
        .fn()
        .mockImplementation(async (fn: (tx: RestoTx) => Promise<unknown>) => fn(makeTx())),
    };

    service = new RefundOrderService(
      orderRepo,
      paymentRepo,
      provider,
      db as unknown as TenantAwareDb,
      new Logger('test'),
    );
  });

  it('rejects empty reason', async () => {
    orderRepo.findById.mockResolvedValue(makeOrder('paid'));
    paymentRepo.findByOrderId.mockResolvedValue(makePaymentRow());
    await expect(
      service.execute({ orderId: ORDER_ID, tenantId: TENANT_ID, reason: '' }),
    ).rejects.toBeInstanceOf(RefundReasonRequiredError);
  });

  it('rejects whitespace-only reason', async () => {
    orderRepo.findById.mockResolvedValue(makeOrder('paid'));
    paymentRepo.findByOrderId.mockResolvedValue(makePaymentRow());
    await expect(
      service.execute({ orderId: ORDER_ID, tenantId: TENANT_ID, reason: '   ' }),
    ).rejects.toBeInstanceOf(RefundReasonRequiredError);
  });

  it('does not gate on order status — succeeds when order is created but a captured payment row exists (10-03 / RESEARCH.md C.9)', async () => {
    orderRepo.findById.mockResolvedValue(makeOrder('created'));
    paymentRepo.findByOrderId.mockResolvedValue(makePaymentRow());
    await expect(
      service.execute({ orderId: ORDER_ID, tenantId: TENANT_ID, reason: 'test' }),
    ).resolves.toBeDefined();
  });

  it('rejects refund with no payment row', async () => {
    orderRepo.findById.mockResolvedValue(makeOrder('paid'));
    paymentRepo.findByOrderId.mockResolvedValue(null);
    await expect(
      service.execute({ orderId: ORDER_ID, tenantId: TENANT_ID, reason: 'test' }),
    ).rejects.toBeInstanceOf(PaymentNotRefundableError);
  });

  it('partial refund: adaptor called, refunds row inserted, refunded_amount updated, order stays paid, event appended', async () => {
    orderRepo.findById.mockResolvedValue(makeOrder('paid', '20.00'));
    paymentRepo.findByOrderId.mockResolvedValue(makePaymentRow('0.00'));
    paymentRepo.upsertByPaymentIntentId.mockResolvedValue(makePaymentRow('5.00'));

    await service.execute({
      orderId: ORDER_ID,
      tenantId: TENANT_ID,
      amountMinor: 500,
      reason: 'item out of stock',
    });

    expect(provider.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentIntentId: PAYMENT_INTENT_ID,
        connectedAccountId: STRIPE_ACCOUNT_ID,
        amountMinor: 500,
        refundRequestId: expect.stringContaining('refund:'),
      }),
    );
    expect(paymentRepo.upsertRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        paymentId: PAYMENT_ID,
        stripeRefundId: null,
        reason: 'item out of stock',
        status: 'pending',
        refundRequestId: expect.stringContaining('refund:'),
      }),
      expect.anything(),
    );
    expect(paymentRepo.updateRefundOutcome).toHaveBeenCalledWith(
      TENANT_ID,
      expect.stringContaining('refund:'),
      expect.objectContaining({ status: 'succeeded', stripeRefundId: 're_test_123' }),
      expect.anything(),
    );
    expect(paymentRepo.upsertByPaymentIntentId).toHaveBeenCalledWith(
      expect.objectContaining({
        refundedAmount: '5.00',
      }),
      expect.anything(),
    );
    const savedOrder = orderRepo.update.mock.calls[0]?.[0] as Order;
    expect(savedOrder.toSnapshot().status).toBe('paid');
    expect(orderRepo.update).toHaveBeenCalledWith(expect.anything(), expect.anything());
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('full refund keeps order status unchanged — money-completeness lives on payments.status, not orders.status (10-03 / T-10-03-01)', async () => {
    orderRepo.findById.mockResolvedValue(makeOrder('paid', '20.00'));
    paymentRepo.findByOrderId.mockResolvedValue(makePaymentRow('0.00'));
    paymentRepo.upsertByPaymentIntentId.mockResolvedValue(makePaymentRow('20.00'));

    await service.execute({
      orderId: ORDER_ID,
      tenantId: TENANT_ID,
      reason: 'full refund',
    });

    const savedOrder = orderRepo.update.mock.calls[0]?.[0] as Order;
    expect(savedOrder.toSnapshot().status).toBe('paid');
    expect(orderRepo.update).toHaveBeenCalledWith(expect.anything(), expect.anything());
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('BUG-6 (a): full refund flips payment status to refunded (not left as succeeded)', async () => {
    orderRepo.findById.mockResolvedValue(makeOrder('paid', '20.00'));
    paymentRepo.findByOrderId.mockResolvedValue(makePaymentRow('0.00'));
    paymentRepo.upsertByPaymentIntentId.mockResolvedValue(makePaymentRow('20.00'));

    await service.execute({
      orderId: ORDER_ID,
      tenantId: TENANT_ID,
      reason: 'full refund',
    });

    expect(paymentRepo.upsertByPaymentIntentId).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'refunded' }),
      expect.anything(),
    );
  });

  it('BUG-6 (a): partial refund flips payment status to partially_refunded', async () => {
    orderRepo.findById.mockResolvedValue(makeOrder('paid', '20.00'));
    paymentRepo.findByOrderId.mockResolvedValue(makePaymentRow('0.00'));
    paymentRepo.upsertByPaymentIntentId.mockResolvedValue(makePaymentRow('5.00'));

    await service.execute({
      orderId: ORDER_ID,
      tenantId: TENANT_ID,
      amountMinor: 500,
      reason: 'partial refund',
    });

    expect(paymentRepo.upsertByPaymentIntentId).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'partially_refunded' }),
      expect.anything(),
    );
  });

  it('second refund completing the total keeps order status unchanged (10-03 / T-10-03-01)', async () => {
    orderRepo.findById.mockResolvedValue(makeOrder('paid', '20.00'));
    paymentRepo.findByOrderId.mockResolvedValue(makePaymentRow('15.00'));
    paymentRepo.upsertByPaymentIntentId.mockResolvedValue(makePaymentRow('20.00'));

    await service.execute({
      orderId: ORDER_ID,
      tenantId: TENANT_ID,
      amountMinor: 500,
      reason: 'remaining refund',
    });

    const savedOrder = orderRepo.update.mock.calls[0]?.[0] as Order;
    expect(savedOrder.toSnapshot().status).toBe('paid');
    expect(orderRepo.update).toHaveBeenCalledWith(expect.anything(), expect.anything());
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('over-refund throws RefundExceedsCapturedError', async () => {
    orderRepo.findById.mockResolvedValue(makeOrder('paid', '20.00'));
    paymentRepo.findByOrderId.mockResolvedValue(makePaymentRow('0.00'));

    await expect(
      service.execute({
        orderId: ORDER_ID,
        tenantId: TENANT_ID,
        amountMinor: 2100,
        reason: 'too much',
      }),
    ).rejects.toBeInstanceOf(RefundExceedsCapturedError);
    expect(provider.createRefund).not.toHaveBeenCalled();
  });

  it('idempotency key is deterministic (same request = same key)', async () => {
    orderRepo.findById.mockResolvedValue(makeOrder('paid', '20.00'));
    paymentRepo.findByOrderId.mockResolvedValue(makePaymentRow('0.00'));
    paymentRepo.upsertByPaymentIntentId.mockResolvedValue(makePaymentRow('5.00'));

    await service.execute({
      orderId: ORDER_ID,
      tenantId: TENANT_ID,
      amountMinor: 500,
      reason: 'test',
    });

    const key1 = provider.createRefund.mock.calls[0]?.[0].refundRequestId as string;

    orderRepo.update.mockClear();
    paymentRepo.findByOrderId.mockResolvedValue(makePaymentRow('0.00'));
    orderRepo.findById.mockResolvedValue(makeOrder('paid', '20.00'));

    await service.execute({
      orderId: ORDER_ID,
      tenantId: TENANT_ID,
      amountMinor: 500,
      reason: 'test',
    });

    const key2 = provider.createRefund.mock.calls[1]?.[0].refundRequestId as string;
    expect(key1).toBe(key2);
  });

  it('provider failure records a failed outcome and rethrows RefundProviderFailedError (D-11)', async () => {
    orderRepo.findById.mockResolvedValue(makeOrder('paid', '20.00'));
    paymentRepo.findByOrderId.mockResolvedValue(makePaymentRow('0.00'));
    provider.createRefund.mockRejectedValue(new Error('stripe unavailable'));

    await expect(
      service.execute({ orderId: ORDER_ID, tenantId: TENANT_ID, reason: 'test' }),
    ).rejects.toBeInstanceOf(RefundProviderFailedError);

    expect(paymentRepo.updateRefundOutcome).toHaveBeenCalledWith(
      TENANT_ID,
      expect.stringContaining('refund:'),
      expect.objectContaining({ status: 'failed', failureReason: 'stripe unavailable' }),
      expect.anything(),
    );
    expect(orderRepo.update).not.toHaveBeenCalled();
  });

  it('short-circuits without calling Stripe when a succeeded refund already exists for this exact request', async () => {
    orderRepo.findById.mockResolvedValue(makeOrder('paid', '20.00'));
    paymentRepo.findByOrderId.mockResolvedValue(makePaymentRow('0.00'));
    paymentRepo.findRefundByRequestId.mockResolvedValue({
      id: 'refund-row-existing',
      tenantId: TENANT_ID,
      paymentId: PAYMENT_ID,
      stripeRefundId: 're_already_done',
      refundRequestId: 'refund:whatever',
      amount: '20.00',
      reason: 'test',
      status: 'succeeded',
      failureReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.execute({
      orderId: ORDER_ID,
      tenantId: TENANT_ID,
      reason: 'test',
    });

    expect(provider.createRefund).not.toHaveBeenCalled();
    expect(paymentRepo.upsertRefund).not.toHaveBeenCalled();
    expect(result).toEqual({
      stripeRefundId: 're_already_done',
      amountMinor: 2000,
      fullyRefunded: true,
    });
  });
});
