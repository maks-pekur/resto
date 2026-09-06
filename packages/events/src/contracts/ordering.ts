import { z } from 'zod';
import { TenantId } from '@resto/domain';
import { defineEventContract } from '../envelope';

export const OrderCreatedV1Payload = z.object({
  orderId: z.string().uuid(),
  tenantId: TenantId,
  locationId: z.string().uuid(),
  orderNumber: z.string().min(1).max(20),
  orderType: z.enum(['dine_in', 'pickup', 'delivery']),
  total: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  itemCount: z.number().int().positive(),
});
export type OrderCreatedV1Payload = z.infer<typeof OrderCreatedV1Payload>;

export const OrderCreatedV1 = defineEventContract({
  type: 'ordering.order_created.v1',
  payload: OrderCreatedV1Payload,
});

export const OrderPaidV1Payload = z.object({
  orderId: z.string().uuid(),
  tenantId: TenantId,
  locationId: z.string().uuid(),
  paymentId: z.string().uuid(),
  total: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export type OrderPaidV1Payload = z.infer<typeof OrderPaidV1Payload>;

export const OrderPaidV1 = defineEventContract({
  type: 'ordering.order_paid.v1',
  payload: OrderPaidV1Payload,
});

export const OrderCanceledV1Payload = z.object({
  orderId: z.string().uuid(),
  tenantId: TenantId,
  locationId: z.string().uuid(),
  reason: z.string(),
  reasonCode: z.string(),
  canceledFromStatus: z.string(),
  actorUserId: z.string().nullable(),
});
export type OrderCanceledV1Payload = z.infer<typeof OrderCanceledV1Payload>;

export const OrderCanceledV1 = defineEventContract({
  type: 'ordering.order_canceled.v1',
  payload: OrderCanceledV1Payload,
});

export const OrderRefundedV1Payload = z.object({
  orderId: z.string().uuid(),
  tenantId: TenantId,
  locationId: z.string().uuid(),
  amount: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export type OrderRefundedV1Payload = z.infer<typeof OrderRefundedV1Payload>;

export const OrderRefundedV1 = defineEventContract({
  type: 'ordering.order_refunded.v1',
  payload: OrderRefundedV1Payload,
});

export const OrderStatusChangedV1Payload = z.object({
  orderId: z.string().uuid(),
  tenantId: TenantId,
  locationId: z.string().uuid(),
  previousStatus: z.string(),
  newStatus: z.string(),
  actorUserId: z.string().nullable(),
  reason: z.string().optional(),
});
export type OrderStatusChangedV1Payload = z.infer<typeof OrderStatusChangedV1Payload>;

export const OrderStatusChangedV1 = defineEventContract({
  type: 'ordering.order_status_changed.v1',
  payload: OrderStatusChangedV1Payload,
});
