import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { OrderStatusSchema } from '../../domain/ports';
import type { OrderSnapshot } from '../../domain/order.aggregate';
import type { OrderDetailResult } from '../../application/get-order-detail.service';
import type { ListOrdersResult } from '../../application/list-orders.service';
import {
  OrderDatePresetSchema,
  OrderStatusPresetSchema,
  toOrderFeedResponseRow,
  type OrderFeedListResponse,
} from '../../application/order-feed-dto';

const ChannelSchema = z.enum(['site', 'qr-menu']);
const FulfillmentModeSchema = z.enum(['dine_in', 'pickup', 'delivery']);

export const OrderFeedQueryInputSchema = z.object({
  statusFilter: OrderStatusPresetSchema.optional(),
  datePreset: OrderDatePresetSchema.optional(),
  channel: ChannelSchema.optional(),
  sinceCreatedAt: z.string().datetime({ offset: true }).optional(),
  sinceId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});
export type OrderFeedQueryInput = z.infer<typeof OrderFeedQueryInputSchema>;
export class OrderFeedQueryDto extends createZodDto(OrderFeedQueryInputSchema) {}

export const AcceptOrderInputSchema = z.object({
  prepMinutes: z.number().int().min(5).max(180),
});
export type AcceptOrderInput = z.infer<typeof AcceptOrderInputSchema>;
export class AcceptOrderInputDto extends createZodDto(AcceptOrderInputSchema) {}

export const AdvanceOrderStatusInputSchema = z.object({
  targetStatus: z.enum(['preparing', 'ready', 'completed']),
});
export type AdvanceOrderStatusInput = z.infer<typeof AdvanceOrderStatusInputSchema>;
export class AdvanceOrderStatusInputDto extends createZodDto(AdvanceOrderStatusInputSchema) {}

export const OrderFeedRowResponseSchema = z.object({
  id: z.string().uuid(),
  shortNumber: z.number().int(),
  status: OrderStatusSchema,
  locationId: z.string().uuid(),
  locationName: z.string(),
  fulfillmentMode: FulfillmentModeSchema,
  tableIdentifier: z.string().nullable(),
  tableZoneName: z.string().nullable(),
  tableNumber: z.string().nullable(),
  total: z.string(),
  currency: z.string(),
  itemCount: z.number().int(),
  channel: ChannelSchema,
  createdAt: z.string(),
  acceptedAt: z.string().nullable(),
  preparingAt: z.string().nullable(),
  readyAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  canceledAt: z.string().nullable(),
  etaAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  canceledFromStatus: z.string().nullable(),
  hasFailedRefund: z.boolean(),
});
export class OrderFeedRowResponseDto extends createZodDto(OrderFeedRowResponseSchema) {}

export const OrderFeedListResponseSchema = z.object({
  rows: z.array(OrderFeedRowResponseSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});
export class OrderFeedListResponseDto extends createZodDto(OrderFeedListResponseSchema) {}

export const toOrderFeedListResponse = (result: ListOrdersResult): OrderFeedListResponse => ({
  rows: result.rows.map(toOrderFeedResponseRow),
  total: result.total,
  limit: result.limit,
  offset: result.offset,
});

const OrderModifierResponseSchema = z.object({
  optionId: z.string(),
  nameSnapshot: z.string(),
  priceDelta: z.string(),
  amount: z.number().int(),
  modifierGroupId: z.string().nullable(),
});

const OrderItemResponseSchema = z.object({
  id: z.string(),
  menuItemId: z.string(),
  nameSnapshot: z.string(),
  unitPrice: z.string(),
  currency: z.string(),
  modifiers: z.array(OrderModifierResponseSchema),
  quantity: z.number().int(),
  lineTotal: z.string(),
  categoryId: z.string(),
});

export const OrderSnapshotResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  locationId: z.string(),
  orderNumber: z.string(),
  status: OrderStatusSchema,
  fulfillmentMode: FulfillmentModeSchema,
  tableIdentifier: z.string().nullable(),
  tableZoneName: z.string().nullable(),
  tableNumber: z.string().nullable(),
  customerName: z.string().nullable(),
  customerPhone: z.string().nullable(),
  customerEmail: z.string().nullable(),
  items: z.array(OrderItemResponseSchema),
  subtotal: z.string(),
  deliveryFee: z.string(),
  serviceFee: z.string(),
  discount: z.string(),
  total: z.string(),
  currency: z.string(),
  scheduledFor: z.string().nullable(),
  shortNumber: z.number().int(),
  channel: ChannelSchema,
  acceptedAt: z.string().nullable(),
  preparingAt: z.string().nullable(),
  readyAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  canceledAt: z.string().nullable(),
  acceptedByUserId: z.string().nullable(),
  canceledByUserId: z.string().nullable(),
  cancelReason: z.string().nullable(),
  cancelNote: z.string().nullable(),
  canceledFromStatus: OrderStatusSchema.nullable(),
  etaAt: z.string().nullable(),
  marketingConsent: z.boolean(),
  marketingConsentAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OrderSnapshotResponse = z.infer<typeof OrderSnapshotResponseSchema>;
export class OrderSnapshotResponseDto extends createZodDto(OrderSnapshotResponseSchema) {}

export const OrderDetailResponseSchema = OrderSnapshotResponseSchema.extend({
  hasFailedRefund: z.boolean(),
  failedRefundAmount: z.string().nullable(),
  failedRefundReason: z.string().nullable(),
});
export type OrderDetailResponse = z.infer<typeof OrderDetailResponseSchema>;
export class OrderDetailResponseDto extends createZodDto(OrderDetailResponseSchema) {}

export const toOrderSnapshotResponse = (s: OrderSnapshot): OrderSnapshotResponse => ({
  id: s.id,
  tenantId: s.tenantId,
  locationId: s.locationId,
  orderNumber: s.orderNumber,
  status: s.status,
  fulfillmentMode: s.fulfillmentMode,
  tableIdentifier: s.tableIdentifier,
  tableZoneName: s.tableZoneName,
  tableNumber: s.tableNumber,
  customerName: s.customerName,
  customerPhone: s.customerPhone,
  customerEmail: s.customerEmail,
  items: s.items.map((item) => ({
    id: item.id,
    menuItemId: item.menuItemId,
    nameSnapshot: item.nameSnapshot,
    unitPrice: item.unitPrice,
    currency: item.currency,
    modifiers: item.modifiers.map((m) => ({
      optionId: m.optionId,
      nameSnapshot: m.nameSnapshot,
      priceDelta: m.priceDelta,
      amount: m.amount,
      modifierGroupId: m.modifierGroupId,
    })),
    quantity: item.quantity,
    lineTotal: item.lineTotal,
    categoryId: item.categoryId,
  })),
  subtotal: s.subtotal,
  deliveryFee: s.deliveryFee,
  serviceFee: s.serviceFee,
  discount: s.discount,
  total: s.total,
  currency: s.currency,
  scheduledFor: s.scheduledFor ? s.scheduledFor.toISOString() : null,
  shortNumber: s.shortNumber,
  channel: s.channel,
  acceptedAt: s.acceptedAt ? s.acceptedAt.toISOString() : null,
  preparingAt: s.preparingAt ? s.preparingAt.toISOString() : null,
  readyAt: s.readyAt ? s.readyAt.toISOString() : null,
  completedAt: s.completedAt ? s.completedAt.toISOString() : null,
  canceledAt: s.canceledAt ? s.canceledAt.toISOString() : null,
  acceptedByUserId: s.acceptedByUserId,
  canceledByUserId: s.canceledByUserId,
  cancelReason: s.cancelReason,
  cancelNote: s.cancelNote,
  canceledFromStatus: s.canceledFromStatus,
  etaAt: s.etaAt ? s.etaAt.toISOString() : null,
  marketingConsent: s.marketingConsent,
  marketingConsentAt: s.marketingConsentAt ? s.marketingConsentAt.toISOString() : null,
  createdAt: s.createdAt.toISOString(),
  updatedAt: s.updatedAt.toISOString(),
});

export const toOrderDetailResponse = (result: OrderDetailResult): OrderDetailResponse => ({
  ...toOrderSnapshotResponse(result.order),
  hasFailedRefund: result.hasFailedRefund,
  failedRefundAmount: result.failedRefundAmount,
  failedRefundReason: result.failedRefundReason,
});
