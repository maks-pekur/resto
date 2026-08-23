import { Logger } from '@nestjs/common';
import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import {
  StripeProviderAdapter,
  toStripeRefundReason,
  type StripeClientLike,
} from './stripe-provider.adapter';

// F-51: this double rejects out-of-enum reasons with a 400 like the real API. A permissive fake
// passes against the broken adapter, which is exactly how the bug shipped green.
const STRIPE_ACCEPTED_REASONS = new Set(['duplicate', 'fraudulent', 'requested_by_customer']);

class StripeInvalidRequestError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'StripeInvalidRequestError';
  }
}

const createContractFake = (): {
  client: StripeClientLike;
  lastParams: () => Stripe.RefundCreateParams | undefined;
} => {
  let seen: Stripe.RefundCreateParams | undefined;
  const client = {
    refunds: {
      create: (params: Stripe.RefundCreateParams) => {
        if (params.reason !== undefined && !STRIPE_ACCEPTED_REASONS.has(params.reason)) {
          return Promise.reject(
            new StripeInvalidRequestError(
              'Invalid reason: must be one of duplicate, fraudulent, or requested_by_customer',
            ),
          );
        }
        seen = params;
        return Promise.resolve({ id: 're_test_1', status: 'succeeded' });
      },
    },
  } as unknown as StripeClientLike;
  return { client, lastParams: () => seen };
};

const silentLogger = (): Logger => {
  const logger = new Logger('spec');
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  return logger;
};

const makeAdapter = (client: StripeClientLike): StripeProviderAdapter =>
  new StripeProviderAdapter(
    client,
    {
      STRIPE_APPLICATION_FEE_AMOUNT: 0,
      STRIPE_CONNECT_RETURN_URL: 'https://example.test/return',
      STRIPE_CONNECT_REFRESH_URL: 'https://example.test/refresh',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
    },
    silentLogger(),
  );

const DOMAIN_REASON_CODES = [
  'guest_no_show',
  'kitchen_out_of_stock',
  'kitchen_too_busy',
  'guest_requested',
  'payment_issue',
  'duplicate_order',
  'other',
] as const;

describe('toStripeRefundReason', () => {
  it('passes Stripe’s own three values through unchanged', () => {
    expect(toStripeRefundReason('duplicate')).toBe('duplicate');
    expect(toStripeRefundReason('fraudulent')).toBe('fraudulent');
    expect(toStripeRefundReason('requested_by_customer')).toBe('requested_by_customer');
  });

  it('maps duplicate_order onto duplicate', () => {
    expect(toStripeRefundReason('duplicate_order')).toBe('duplicate');
  });

  it('omits rather than coerces a reason Stripe has no word for', () => {
    expect(toStripeRefundReason('kitchen_out_of_stock')).toBeUndefined();
    expect(toStripeRefundReason('guest_no_show')).toBeUndefined();
    expect(toStripeRefundReason('other')).toBeUndefined();
  });

  it('tolerates surrounding whitespace and casing', () => {
    expect(toStripeRefundReason('  Requested_By_Customer ')).toBe('requested_by_customer');
  });

  it('never returns a value outside Stripe’s enum, for any domain reason', () => {
    for (const code of DOMAIN_REASON_CODES) {
      const mapped = toStripeRefundReason(code);
      if (mapped !== undefined) expect(STRIPE_ACCEPTED_REASONS.has(mapped)).toBe(true);
    }
  });
});

describe('StripeProviderAdapter.createRefund', () => {
  it.each(DOMAIN_REASON_CODES)(
    'succeeds against a contract-faithful Stripe for reason %s',
    async (reason) => {
      const { client, lastParams } = createContractFake();
      const result = await makeAdapter(client).createRefund({
        paymentIntentId: 'pi_test_1',
        connectedAccountId: 'acct_test_1',
        reason,
        refundRequestId: `refund:o1:0:100:${reason}`,
      });

      expect(result).toEqual({ stripeRefundId: 're_test_1', status: 'succeeded' });
      expect(lastParams()?.metadata).toEqual({ resto_reason: reason });
    },
  );

  it('keeps the operator’s real reason in metadata even when Stripe gets none', async () => {
    const { client, lastParams } = createContractFake();
    await makeAdapter(client).createRefund({
      paymentIntentId: 'pi_test_1',
      connectedAccountId: 'acct_test_1',
      reason: 'kitchen_out_of_stock',
      refundRequestId: 'refund:o1:0:100',
    });

    const params = lastParams();
    expect(params?.reason).toBeUndefined();
    expect(params?.metadata).toEqual({ resto_reason: 'kitchen_out_of_stock' });
  });

  it('forwards a partial amount and omits it when refunding in full', async () => {
    const { client, lastParams } = createContractFake();
    const adapter = makeAdapter(client);

    await adapter.createRefund({
      paymentIntentId: 'pi_test_1',
      connectedAccountId: 'acct_test_1',
      amountMinor: 250,
      reason: 'requested_by_customer',
      refundRequestId: 'refund:o1:0:250',
    });
    expect(lastParams()?.amount).toBe(250);

    await adapter.createRefund({
      paymentIntentId: 'pi_test_1',
      connectedAccountId: 'acct_test_1',
      reason: 'requested_by_customer',
      refundRequestId: 'refund:o1:250:750',
    });
    expect(lastParams()?.amount).toBeUndefined();
  });
});
