import { z } from 'zod';
import type { RestoTx } from '@resto/db';
import type { OrderId, TenantId } from '@resto/domain';
import type { Order, OrderStatus } from './order.aggregate';

export interface OrderRepository {
  save(order: Order): Promise<void>;
  update(order: Order, tx?: RestoTx): Promise<void>;
  findById(id: OrderId): Promise<Order | null>;
  // ADR-0020 I-6: background/webhook paths run under BYPASSRLS with no ALS tenant —
  // callers must supply tx + tenantId explicitly instead of using findById.
  findByIdInTx(tx: RestoTx, id: OrderId, tenantId: string): Promise<Order | null>;
  findByIdempotencyKey(tenantId: TenantId, key: string): Promise<Order | null>;
}

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

export interface PricedMenuItemSize {
  readonly sizeId: string;
  readonly price: string;
}

export interface PricedMenuItem {
  readonly itemId: string;
  readonly categoryId: string;
  readonly basePrice: string;
  readonly sizes: readonly PricedMenuItemSize[];
  readonly modifierGroupIds: readonly string[];
}

export interface PricedModifierOption {
  readonly optionId: string;
  readonly groupId: string;
  readonly priceDelta: string;
  readonly freeAmount: number;
  readonly minAmount: number | null;
  readonly maxAmount: number | null;
}

export interface PricedModifierGroup {
  readonly groupId: string;
  readonly minSelectable: number;
  readonly maxSelectable: number;
  readonly isRequired: boolean;
}

export interface OrderingMenuSnapshot {
  readonly currency: string;
  readonly items: readonly PricedMenuItem[];
  readonly modifierGroups: readonly PricedModifierGroup[];
  readonly modifierOptions: readonly PricedModifierOption[];
  readonly stoppedItemIds: readonly string[];
}

// Server-authoritative pricing for the order path: the create-order service must
// never trust client-supplied prices (API review 2026-06-15 BLOCK-1). The caller
// resolves the order's location (from its table, or the tenant default) before
// pricing and passes it in — the snapshot must answer for that location's stop
// list, never for whichever location the adapter would pick on its own.
export interface MenuPricingPort {
  loadSnapshot(tenantId: TenantId, locationId: string): Promise<OrderingMenuSnapshot>;
}

export const MENU_PRICING_PORT = Symbol('MENU_PRICING_PORT');

export interface ResolvedOrderTable {
  readonly tableId: string;
  readonly zoneName: string;
  readonly number: string;
  readonly locationId: string;
}

export interface OrderTableLookupPort {
  findActiveTable(tableId: string): Promise<ResolvedOrderTable | null>;
}

export const ORDER_TABLE_LOOKUP_PORT = Symbol('ORDER_TABLE_LOOKUP_PORT');

export interface NextShortNumberInput {
  readonly tenantId: TenantId;
  readonly locationId: string;
  readonly businessDate: string;
}

export interface OrderSequencePort {
  nextShortNumber(input: NextShortNumberInput): Promise<number>;
}

export const ORDER_SEQUENCE_PORT = Symbol('ORDER_SEQUENCE_PORT');

export const OrderStatusSchema: z.ZodType<OrderStatus> = z.enum([
  'created',
  'requires_action',
  'paid',
  'accepted',
  'preparing',
  'ready',
  'completed',
  'canceled',
  'refunded',
  'failed',
]);

export const OrderFeedQuerySchema = z.object({
  tenantId: z.string().uuid(),
  locationIds: z.array(z.string().uuid()),
  statuses: z.array(OrderStatusSchema),
  channel: z.enum(['site', 'qr-menu']).optional(),
  fulfillmentMode: z.enum(['dine_in', 'pickup', 'delivery']).optional(),
  createdFrom: z.date(),
  createdTo: z.date(),
  since: z
    .object({
      createdAt: z.date(),
      id: z.string().uuid(),
    })
    .optional(),
  /** `paid` alone is not the whole answer: an accepted order keeps that status until it is started. */
  unacceptedOnly: z.boolean().optional(),
  /** Open work is served oldest first — the order waiting longest is the one to act on. */
  sort: z.enum(['oldest_first', 'newest_first']).optional(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});
export type OrderFeedQuery = z.infer<typeof OrderFeedQuerySchema>;

export const OrderFeedCountsQuerySchema = z.object({
  tenantId: z.string().uuid(),
  locationIds: z.array(z.string().uuid()),
  fulfillmentMode: z.enum(['dine_in', 'pickup', 'delivery']).optional(),
  createdFrom: z.date(),
  createdTo: z.date(),
});
export type OrderFeedCountsQuery = z.infer<typeof OrderFeedCountsQuerySchema>;

export interface OrderFeedCounts {
  readonly unaccepted: number;
  readonly accepted: number;
  readonly preparing: number;
  readonly ready: number;
  readonly completed: number;
  readonly canceled: number;
}

export const OrderFeedRowSchema = z.object({
  id: z.string().uuid(),
  shortNumber: z.number().int(),
  status: OrderStatusSchema,
  locationId: z.string().uuid(),
  locationName: z.string(),
  fulfillmentMode: z.enum(['dine_in', 'pickup', 'delivery']),
  tableIdentifier: z.string().nullable(),
  tableZoneName: z.string().nullable(),
  tableNumber: z.string().nullable(),
  customerName: z.string().nullable(),
  customerPhone: z.string().nullable(),
  total: z.string(),
  currency: z.string(),
  itemCount: z.number().int(),
  channel: z.enum(['site', 'qr-menu']),
  createdAt: z.date(),
  acceptedAt: z.date().nullable(),
  preparingAt: z.date().nullable(),
  readyAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  canceledAt: z.date().nullable(),
  etaAt: z.date().nullable(),
  cancelReason: z.string().nullable(),
  canceledFromStatus: z.string().nullable(),
  hasFailedRefund: z.boolean(),
});
export type OrderFeedRow = z.infer<typeof OrderFeedRowSchema>;

export interface OrderFeedRepository {
  list(input: OrderFeedQuery): Promise<{ rows: OrderFeedRow[]; total: number }>;
  counts(input: OrderFeedCountsQuery): Promise<OrderFeedCounts>;
}

export const ORDER_FEED_REPOSITORY = Symbol('ORDER_FEED_REPOSITORY');
