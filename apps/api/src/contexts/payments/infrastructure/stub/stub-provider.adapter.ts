import { Injectable } from '@nestjs/common';
import type {
  CancelPaymentIntentInput,
  CancelPaymentIntentResult,
  CreateOnboardingAccountInput,
  CreateOnboardingAccountResult,
  CreateOnboardingLinkInput,
  CreateOnboardingLinkResult,
  CreatePaymentIntentInput,
  CreatePaymentIntentResult,
  CreateRefundInput,
  CreateRefundResult,
  PaymentProviderPort,
  RetrieveAccountInput,
  RetrieveAccountResult,
  WebhookEvent,
} from '../../domain/ports';

@Injectable()
export class StubProviderAdapter implements PaymentProviderPort {
  ensureOnboardingAccount(
    _input: CreateOnboardingAccountInput,
  ): Promise<CreateOnboardingAccountResult> {
    return Promise.resolve({ accountId: 'stub_acct_12345' });
  }

  createOnboardingLink(_input: CreateOnboardingLinkInput): Promise<CreateOnboardingLinkResult> {
    return Promise.resolve({
      url: 'https://stub.example.com/onboard',
      expiresAt: Date.now() + 3600_000,
    });
  }

  createOnboardingSession(_input: { accountId: string }): Promise<{ clientSecret: string }> {
    return Promise.resolve({ clientSecret: 'stub_secret_test' });
  }

  exchangeOAuthCode(_input: { code: string }): Promise<{ accountId: string }> {
    return Promise.resolve({ accountId: 'stub_acct_12345' });
  }

  retrieveAccount(_input: RetrieveAccountInput): Promise<RetrieveAccountResult> {
    return Promise.resolve({ chargesEnabled: true, payoutsEnabled: true, requirementsDue: null });
  }

  createPaymentIntent(_input: CreatePaymentIntentInput): Promise<CreatePaymentIntentResult> {
    return Promise.resolve({
      paymentIntentId: 'pi_stub_123',
      clientSecret: 'pi_stub_123_secret',
      status: 'requires_payment_method',
    });
  }

  cancelPaymentIntent(_input: CancelPaymentIntentInput): Promise<CancelPaymentIntentResult> {
    return Promise.resolve({ status: 'canceled' });
  }

  createRefund(_input: CreateRefundInput): Promise<CreateRefundResult> {
    return Promise.resolve({ stripeRefundId: 're_stub_123', status: 'succeeded' });
  }

  verifyWebhookSignature(_input: { rawBody: Buffer; signature: string }): WebhookEvent {
    return { id: 'evt_stub_123', type: 'stub.event', data: {} };
  }
}
