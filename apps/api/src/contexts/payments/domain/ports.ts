import type { TenantId } from '@resto/domain';
import type { RestoTx } from '@resto/db';

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
