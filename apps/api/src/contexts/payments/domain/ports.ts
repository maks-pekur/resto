import type { TenantId } from '@resto/domain';
import type { RestoTx } from '@resto/db';

export interface WebhookEvent {
  id: string;
  type: string;
  data: unknown;
}

export interface CreateOnboardingAccountInput {
  readonly brandId: string;
  readonly displayName: string;
  readonly country?: string;
  readonly defaultCurrency?: string;
  readonly accountType: string;
}

export interface CreateOnboardingLinkInput {
  readonly accountId: string;
  readonly refreshUrl: string;
  readonly returnUrl: string;
}

export interface CreatePaymentIntentInput {
  readonly orderId: string;
  readonly connectedAccountId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly applicationFeeMinor: number;
  readonly attempt: number;
  readonly metadata: Record<string, string>;
}

export interface CancelPaymentIntentInput {
  readonly paymentIntentId: string;
  readonly connectedAccountId: string;
  readonly reason?: string;
}

export interface CreateRefundInput {
  readonly paymentIntentId: string;
  readonly connectedAccountId: string;
  readonly amountMinor?: number;
  readonly reason: string;
  readonly refundRequestId: string;
}

export interface RetrieveAccountInput {
  readonly accountId: string;
}

export interface CreateOnboardingAccountResult {
  readonly accountId: string;
}

export interface CreateOnboardingLinkResult {
  readonly url: string;
  readonly expiresAt: number;
}

export interface CreatePaymentIntentResult {
  readonly paymentIntentId: string;
  readonly clientSecret: string;
  readonly status: string;
}

export interface CancelPaymentIntentResult {
  readonly status: string;
}

export interface CreateRefundResult {
  readonly stripeRefundId: string;
  readonly status: string;
}

export interface RetrieveAccountResult {
  readonly chargesEnabled: boolean;
  readonly payoutsEnabled: boolean;
  readonly requirementsDue: string[] | null;
}

export interface PaymentProviderPort {
  ensureOnboardingAccount(
    input: CreateOnboardingAccountInput,
  ): Promise<CreateOnboardingAccountResult>;
  createOnboardingLink(input: CreateOnboardingLinkInput): Promise<CreateOnboardingLinkResult>;
  createOnboardingSession(input: { accountId: string }): Promise<{ clientSecret: string }>;
  exchangeOAuthCode(input: { code: string }): Promise<{ accountId: string }>;
  retrieveAccount(input: RetrieveAccountInput): Promise<RetrieveAccountResult>;
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<CreatePaymentIntentResult>;
  cancelPaymentIntent(input: CancelPaymentIntentInput): Promise<CancelPaymentIntentResult>;
  createRefund(input: CreateRefundInput): Promise<CreateRefundResult>;
  verifyWebhookSignature(input: { rawBody: Buffer; signature: string }): WebhookEvent;
}

export const PAYMENT_PROVIDER_PORT = Symbol('PAYMENT_PROVIDER_PORT');

export interface PaymentRow {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly orderId: string;
  readonly status: string;
  readonly amount: string;
  readonly currency: string;
  readonly paymentIntentId: string | null;
  readonly latestChargeId: string | null;
  readonly refundedAmount: string;
  readonly stripeAccountId: string | null;
  readonly applicationFeeAmount: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PaymentRefundRow {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly paymentId: string;
  readonly stripeRefundId: string;
  readonly amount: string;
  readonly reason: string;
  readonly status: string;
  readonly createdAt: Date;
}

export interface UpsertPaymentInput {
  readonly id?: string;
  readonly tenantId: TenantId;
  readonly orderId: string;
  readonly status: string;
  readonly amount: string;
  readonly currency: string;
  readonly paymentIntentId?: string | null;
  readonly latestChargeId?: string | null;
  readonly refundedAmount?: string;
  readonly stripeAccountId?: string | null;
  readonly applicationFeeAmount?: string;
}

export interface UpsertPaymentRefundInput {
  readonly tenantId: TenantId;
  readonly paymentId: string;
  readonly stripeRefundId: string;
  readonly amount: string;
  readonly reason: string;
  readonly status: string;
}

export interface PaymentRepository {
  findByPaymentIntentId(
    tenantId: TenantId,
    paymentIntentId: string,
    tx: RestoTx,
  ): Promise<PaymentRow | null>;
  findByOrderId(tenantId: TenantId, orderId: string, tx: RestoTx): Promise<PaymentRow | null>;
  upsertByPaymentIntentId(input: UpsertPaymentInput, tx: RestoTx): Promise<PaymentRow>;
  findRefundByStripeId(
    tenantId: TenantId,
    stripeRefundId: string,
    tx: RestoTx,
  ): Promise<PaymentRefundRow | null>;
  upsertRefund(input: UpsertPaymentRefundInput, tx: RestoTx): Promise<PaymentRefundRow>;
  updateRefundStatus(
    tenantId: TenantId,
    stripeRefundId: string,
    status: string,
    tx: RestoTx,
  ): Promise<void>;
}

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');
