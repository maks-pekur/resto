import { describe, expect, it } from 'vitest';
import type { PaymentProviderPort } from '../../domain/ports';
import { StubProviderAdapter } from './stub-provider.adapter';

describe('StubProviderAdapter', () => {
  const stub = new StubProviderAdapter();

  const _typeCheck: PaymentProviderPort = stub satisfies PaymentProviderPort;
  void _typeCheck;

  it('ensureOnboardingAccount returns a stub accountId', async () => {
    const result = await stub.ensureOnboardingAccount({
      tenantId: 'tenant-1',
      displayName: 'Test Tenant',
      accountType: 'express',
    });
    expect(result).toEqual({ accountId: 'stub_acct_12345' });
  });

  it('createOnboardingLink returns a stub url', async () => {
    const result = await stub.createOnboardingLink({
      accountId: 'stub_acct_12345',
      refreshUrl: 'https://example.com/refresh',
      returnUrl: 'https://example.com/return',
    });
    expect(result).toMatchObject({ url: expect.any(String), expiresAt: expect.any(Number) });
  });

  it('createOnboardingSession returns a stub clientSecret', async () => {
    const result = await stub.createOnboardingSession({ accountId: 'stub_acct_12345' });
    expect(result).toEqual({ clientSecret: 'stub_secret_test' });
  });

  it('exchangeOAuthCode returns a stub accountId', async () => {
    const result = await stub.exchangeOAuthCode({ code: 'stub_code' });
    expect(result).toEqual({ accountId: 'stub_acct_12345' });
  });

  it('retrieveAccount returns stub capability flags', async () => {
    const result = await stub.retrieveAccount({ accountId: 'stub_acct_12345' });
    expect(result).toMatchObject({
      chargesEnabled: expect.any(Boolean),
      payoutsEnabled: expect.any(Boolean),
    });
  });

  it('createPaymentIntent returns stub intent data', async () => {
    const result = await stub.createPaymentIntent({
      orderId: 'order-1',
      connectedAccountId: 'stub_acct_12345',
      amountMinor: 1000,
      currency: 'usd',
      applicationFeeMinor: 0,
      attempt: 1,
      metadata: {},
    });
    expect(result).toMatchObject({
      paymentIntentId: expect.any(String),
      clientSecret: expect.any(String),
      status: expect.any(String),
    });
  });

  it('cancelPaymentIntent returns stub status', async () => {
    const result = await stub.cancelPaymentIntent({
      paymentIntentId: 'pi_stub_123',
      connectedAccountId: 'stub_acct_12345',
    });
    expect(result).toMatchObject({ status: expect.any(String) });
  });

  it('createRefund returns stub refund data', async () => {
    const result = await stub.createRefund({
      paymentIntentId: 'pi_stub_123',
      connectedAccountId: 'stub_acct_12345',
      reason: 'requested_by_customer',
      refundRequestId: 'ref-1',
    });
    expect(result).toMatchObject({
      stripeRefundId: expect.any(String),
      status: expect.any(String),
    });
  });

  it('verifyWebhookSignature returns a provider-neutral WebhookEvent', () => {
    const event = stub.verifyWebhookSignature({
      rawBody: Buffer.from('{}'),
      signature: 'stub_sig',
    });
    expect(event).toMatchObject({
      id: expect.any(String),
      type: expect.any(String),
    });
  });
});
