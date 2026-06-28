import { z } from 'zod';
import { TenantId } from '@resto/domain';
import { defineEventContract } from '../envelope';

export const PaymentOrderSucceededV1Payload = z.object({
  orderId: z.string().uuid(),
  tenantId: TenantId,
  paymentIntentId: z.string().min(1).max(255),
  chargeId: z.string().min(1).max(255),
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export type PaymentOrderSucceededV1Payload = z.infer<typeof PaymentOrderSucceededV1Payload>;

export const PaymentOrderSucceededV1 = defineEventContract({
  type: 'payments.order_payment_succeeded.v1',
  payload: PaymentOrderSucceededV1Payload,
});

export const PaymentOrderFailedV1Payload = z.object({
  orderId: z.string().uuid(),
  tenantId: TenantId,
  paymentIntentId: z.string().min(1).max(255),
  failureCode: z.string().min(1).max(255),
});
export type PaymentOrderFailedV1Payload = z.infer<typeof PaymentOrderFailedV1Payload>;

export const PaymentOrderFailedV1 = defineEventContract({
  type: 'payments.order_payment_failed.v1',
  payload: PaymentOrderFailedV1Payload,
});

export const PaymentOrderRefundedV1Payload = z.object({
  orderId: z.string().uuid(),
  tenantId: TenantId,
  refundId: z.string().min(1).max(255),
  amountMinor: z.number().int().nonnegative(),
  fullyRefunded: z.boolean(),
});
export type PaymentOrderRefundedV1Payload = z.infer<typeof PaymentOrderRefundedV1Payload>;

export const PaymentOrderRefundedV1 = defineEventContract({
  type: 'payments.order_refunded.v1',
  payload: PaymentOrderRefundedV1Payload,
});

export const PaymentDisputeOpenedV1Payload = z.object({
  orderId: z.string().uuid(),
  tenantId: TenantId,
  disputeId: z.string().min(1).max(255),
  amountMinor: z.number().int().nonnegative(),
  reason: z.string().min(1).max(255),
});
export type PaymentDisputeOpenedV1Payload = z.infer<typeof PaymentDisputeOpenedV1Payload>;

export const PaymentDisputeOpenedV1 = defineEventContract({
  type: 'payments.dispute_opened.v1',
  payload: PaymentDisputeOpenedV1Payload,
});
