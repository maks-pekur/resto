import { Logger } from '@nestjs/common';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StripeConnectAdapter, type StripeClientLike } from './stripe-connect.adapter';

const TEST_CONNECTED_ACCOUNT_ID = 'acct_test_connected';
const TEST_ORDER_ID = 'order-uuid-123';
const TEST_REFUND_REQUEST_ID = 'refund-req-uuid-456';
const TEST_PAYMENT_INTENT_ID = 'pi_test_abc';
const TEST_ENV = {
  STRIPE_APPLICATION_FEE_AMOUNT: 0,
  STRIPE_CONNECT_RETURN_URL: 'https://admin.example.com/stripe/return',
  STRIPE_CONNECT_REFRESH_URL: 'https://admin.example.com/stripe/refresh',
} as const;

function makeClient(overrides: Partial<StripeClientLike> = {}): {
  client: StripeClientLike;
  mocks: {
    accountsCreate: ReturnType<typeof vi.fn>;
    accountsRetrieve: ReturnType<typeof vi.fn>;
    accountLinksCreate: ReturnType<typeof vi.fn>;
    paymentIntentsCreate: ReturnType<typeof vi.fn>;
    paymentIntentsCancel: ReturnType<typeof vi.fn>;
    refundsCreate: ReturnType<typeof vi.fn>;
  };
} {
  const accountsCreate = vi.fn().mockResolvedValue({ id: 'acct_new' });
  const accountsRetrieve = vi.fn().mockResolvedValue({
    id: 'acct_test',
    charges_enabled: true,
    payouts_enabled: true,
    requirements: { currently_due: [] },
  });
  const accountLinksCreate = vi.fn().mockResolvedValue({
    url: 'https://connect.stripe.com/onboarding/test',
    expires_at: 1700000000,
  });
  const paymentIntentsCreate = vi.fn().mockResolvedValue({
    id: TEST_PAYMENT_INTENT_ID,
    client_secret: 'pi_test_abc_secret_xyz',
    status: 'requires_payment_method',
  });
  const paymentIntentsCancel = vi.fn().mockResolvedValue({
    id: TEST_PAYMENT_INTENT_ID,
    status: 'canceled',
  });
  const refundsCreate = vi.fn().mockResolvedValue({
    id: 're_test_refund_id',
    status: 'succeeded',
  });

  const client: StripeClientLike = {
    accounts: {
      create: accountsCreate,
      retrieve: accountsRetrieve,
    },
    accountLinks: {
      create: accountLinksCreate,
    },
    paymentIntents: {
      create: paymentIntentsCreate,
      cancel: paymentIntentsCancel,
    },
    refunds: {
      create: refundsCreate,
    },
    ...overrides,
  };

  return {
    client,
    mocks: {
      accountsCreate,
      accountsRetrieve,
      accountLinksCreate,
      paymentIntentsCreate,
      paymentIntentsCancel,
      refundsCreate,
    },
  };
}

describe('StripeConnectAdapter', () => {
  let adapter: StripeConnectAdapter;
  let mocks: ReturnType<typeof makeClient>['mocks'];

  beforeEach(() => {
    const { client, mocks: m } = makeClient();
    mocks = m;
    adapter = new StripeConnectAdapter(client, TEST_ENV, new Logger('test'));
  });

  describe('createPaymentIntent — direct charge (D-02)', () => {
    it('calls paymentIntents.create with stripeAccount option (not transfer_data.destination)', async () => {
      await adapter.createPaymentIntent({
        orderId: TEST_ORDER_ID,
        connectedAccountId: TEST_CONNECTED_ACCOUNT_ID,
        amountMinor: 1500,
        currency: 'EUR',
        applicationFeeMinor: 0,
        attempt: 1,
        metadata: { orderId: TEST_ORDER_ID },
      });

      const [, requestOptions] = mocks.paymentIntentsCreate.mock.calls[0] as [
        unknown,
        { stripeAccount?: string; idempotencyKey?: string },
      ];
      expect(requestOptions).toBeDefined();
      expect(requestOptions.stripeAccount).toBe(TEST_CONNECTED_ACCOUNT_ID);
    });

    it('NEVER sets transfer_data.destination (D-02 direct charge invariant)', async () => {
      await adapter.createPaymentIntent({
        orderId: TEST_ORDER_ID,
        connectedAccountId: TEST_CONNECTED_ACCOUNT_ID,
        amountMinor: 1500,
        currency: 'EUR',
        applicationFeeMinor: 0,
        attempt: 1,
        metadata: {},
      });

      const [payload] = mocks.paymentIntentsCreate.mock.calls[0] as [Record<string, unknown>];
      expect(payload).not.toHaveProperty('transfer_data');
    });

    it('passes idempotencyKey derived from orderId + attempt (D-09)', async () => {
      await adapter.createPaymentIntent({
        orderId: TEST_ORDER_ID,
        connectedAccountId: TEST_CONNECTED_ACCOUNT_ID,
        amountMinor: 1500,
        currency: 'EUR',
        applicationFeeMinor: 0,
        attempt: 2,
        metadata: {},
      });

      const [, requestOptions] = mocks.paymentIntentsCreate.mock.calls[0] as [
        unknown,
        { idempotencyKey?: string },
      ];
      expect(requestOptions.idempotencyKey).toBe(`pi:${TEST_ORDER_ID}:2`);
    });

    it('passes application_fee_amount from config (D-01/D-03) — 0 by default', async () => {
      await adapter.createPaymentIntent({
        orderId: TEST_ORDER_ID,
        connectedAccountId: TEST_CONNECTED_ACCOUNT_ID,
        amountMinor: 1500,
        currency: 'EUR',
        applicationFeeMinor: 0,
        attempt: 1,
        metadata: {},
      });

      const [payload] = mocks.paymentIntentsCreate.mock.calls[0] as [
        { application_fee_amount?: number },
      ];
      expect(payload.application_fee_amount).toBe(0);
    });

    it('passes a non-zero applicationFeeMinor through to application_fee_amount', async () => {
      await adapter.createPaymentIntent({
        orderId: TEST_ORDER_ID,
        connectedAccountId: TEST_CONNECTED_ACCOUNT_ID,
        amountMinor: 5000,
        currency: 'USD',
        applicationFeeMinor: 50,
        attempt: 1,
        metadata: {},
      });

      const [payload] = mocks.paymentIntentsCreate.mock.calls[0] as [
        { application_fee_amount?: number },
      ];
      expect(payload.application_fee_amount).toBe(50);
    });

    it('retries on 5xx with the SAME idempotency key (no double create)', async () => {
      let callCount = 0;
      const failThenSucceed = vi.fn().mockImplementation((_params: unknown, _opts: unknown) => {
        callCount += 1;
        if (callCount === 1) {
          const err = Object.assign(new Error('Internal server error'), { statusCode: 500 });
          return Promise.reject(err);
        }
        return Promise.resolve({
          id: TEST_PAYMENT_INTENT_ID,
          client_secret: 'secret',
          status: 'requires_payment_method',
        });
      });

      const { client } = makeClient({
        paymentIntents: {
          create: failThenSucceed,
          cancel: vi.fn().mockResolvedValue({ id: TEST_PAYMENT_INTENT_ID, status: 'canceled' }),
        },
      });
      const retryAdapter = new StripeConnectAdapter(client, TEST_ENV, new Logger('test'));

      await retryAdapter.createPaymentIntent({
        orderId: TEST_ORDER_ID,
        connectedAccountId: TEST_CONNECTED_ACCOUNT_ID,
        amountMinor: 1500,
        currency: 'EUR',
        applicationFeeMinor: 0,
        attempt: 1,
        metadata: {},
      });

      expect(failThenSucceed).toHaveBeenCalledTimes(2);
      const key1 = (failThenSucceed.mock.calls[0] as [unknown, { idempotencyKey: string }])[1]
        .idempotencyKey;
      const key2 = (failThenSucceed.mock.calls[1] as [unknown, { idempotencyKey: string }])[1]
        .idempotencyKey;
      expect(key1).toBe(key2);
    });

    it('does NOT retry on 4xx (terminal failure)', async () => {
      const terminalError = vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('Bad request'), { statusCode: 400 }));
      const { client } = makeClient({
        paymentIntents: {
          create: terminalError,
          cancel: vi.fn().mockResolvedValue({ status: 'canceled' }),
        },
      });
      const terminalAdapter = new StripeConnectAdapter(client, TEST_ENV, new Logger('test'));

      await expect(
        terminalAdapter.createPaymentIntent({
          orderId: TEST_ORDER_ID,
          connectedAccountId: TEST_CONNECTED_ACCOUNT_ID,
          amountMinor: 1500,
          currency: 'EUR',
          applicationFeeMinor: 0,
          attempt: 1,
          metadata: {},
        }),
      ).rejects.toThrow();

      expect(terminalError).toHaveBeenCalledTimes(1);
    });
  });

  describe('createRefund (D-09 idempotency)', () => {
    it('passes idempotencyKey as refund:<refundRequestId>', async () => {
      await adapter.createRefund({
        paymentIntentId: TEST_PAYMENT_INTENT_ID,
        connectedAccountId: TEST_CONNECTED_ACCOUNT_ID,
        amountMinor: 500,
        reason: 'requested_by_customer',
        refundRequestId: TEST_REFUND_REQUEST_ID,
      });

      const [, requestOptions] = mocks.refundsCreate.mock.calls[0] as [
        unknown,
        { idempotencyKey?: string; stripeAccount?: string },
      ];
      expect(requestOptions.idempotencyKey).toBe(`refund:${TEST_REFUND_REQUEST_ID}`);
    });

    it('passes stripeAccount in request options', async () => {
      await adapter.createRefund({
        paymentIntentId: TEST_PAYMENT_INTENT_ID,
        connectedAccountId: TEST_CONNECTED_ACCOUNT_ID,
        amountMinor: 500,
        reason: 'requested_by_customer',
        refundRequestId: TEST_REFUND_REQUEST_ID,
      });

      const [, requestOptions] = mocks.refundsCreate.mock.calls[0] as [
        unknown,
        { stripeAccount?: string },
      ];
      expect(requestOptions.stripeAccount).toBe(TEST_CONNECTED_ACCOUNT_ID);
    });
  });

  describe('cancelPaymentIntent', () => {
    it('calls paymentIntents.cancel with stripeAccount option', async () => {
      await adapter.cancelPaymentIntent({
        paymentIntentId: TEST_PAYMENT_INTENT_ID,
        connectedAccountId: TEST_CONNECTED_ACCOUNT_ID,
        reason: 'duplicate',
      });

      const [piId, , requestOptions] = mocks.paymentIntentsCancel.mock.calls[0] as [
        string,
        unknown,
        { stripeAccount?: string },
      ];
      expect(piId).toBe(TEST_PAYMENT_INTENT_ID);
      expect(requestOptions.stripeAccount).toBe(TEST_CONNECTED_ACCOUNT_ID);
    });
  });

  describe('retrieveAccount', () => {
    it('returns chargesEnabled, payoutsEnabled, requirementsDue from Stripe account', async () => {
      const result = await adapter.retrieveAccount({ accountId: 'acct_test' });

      expect(result.chargesEnabled).toBe(true);
      expect(result.payoutsEnabled).toBe(true);
      expect(result.requirementsDue).toBeDefined();
    });
  });
});
