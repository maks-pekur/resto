import { z } from 'zod';
import type { OrderFeedRow } from '../domain/ports';

export const OrderStatusPresetSchema = z.enum([
  'active',
  'all_today',
  'unaccepted',
  'accepted',
  'preparing',
  'ready',
  'completed',
  'canceled',
  'refund_failed',
]);
export type OrderStatusPreset = z.infer<typeof OrderStatusPresetSchema>;

export const OrderDatePresetSchema = z.enum(['today', 'yesterday', 'week']);
export type OrderDatePreset = z.infer<typeof OrderDatePresetSchema>;

export const OrderFeedSinceCursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});
export type OrderFeedSinceCursor = z.infer<typeof OrderFeedSinceCursorSchema>;

export interface OrderFeedResponseRow {
  readonly id: string;
  readonly shortNumber: number;
  readonly status: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly orderType: 'dine_in' | 'pickup' | 'delivery';
  readonly tableIdentifier: string | null;
  readonly tableZoneName: string | null;
  readonly tableNumber: string | null;
  readonly customerName: string | null;
  readonly customerPhone: string | null;
  readonly total: string;
  readonly currency: string;
  readonly itemCount: number;
  readonly channel: 'site' | 'qr-menu';
  readonly createdAt: string;
  readonly acceptedAt: string | null;
  readonly preparingAt: string | null;
  readonly readyAt: string | null;
  readonly completedAt: string | null;
  readonly canceledAt: string | null;
  readonly etaAt: string | null;
  readonly cancelReason: string | null;
  readonly canceledFromStatus: string | null;
  readonly hasFailedRefund: boolean;
}

export interface OrderFeedListResponse {
  readonly rows: readonly OrderFeedResponseRow[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

// Table label precedence (CONTEXT D-22): tableZoneName + tableNumber when both
// present, else legacy tableIdentifier, else nothing. table_identifier has had
// no writer since the free-text create-order field was removed (10.3-09).
export const toOrderFeedResponseRow = (row: OrderFeedRow): OrderFeedResponseRow => ({
  id: row.id,
  shortNumber: row.shortNumber,
  status: row.status,
  locationId: row.locationId,
  locationName: row.locationName,
  orderType: row.orderType,
  tableIdentifier: row.tableIdentifier,
  tableZoneName: row.tableZoneName,
  tableNumber: row.tableNumber,
  customerName: row.customerName,
  customerPhone: row.customerPhone,
  total: row.total,
  currency: row.currency,
  itemCount: row.itemCount,
  channel: row.channel,
  createdAt: row.createdAt.toISOString(),
  acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
  preparingAt: row.preparingAt ? row.preparingAt.toISOString() : null,
  readyAt: row.readyAt ? row.readyAt.toISOString() : null,
  completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  canceledAt: row.canceledAt ? row.canceledAt.toISOString() : null,
  etaAt: row.etaAt ? row.etaAt.toISOString() : null,
  cancelReason: row.cancelReason,
  canceledFromStatus: row.canceledFromStatus,
  hasFailedRefund: row.hasFailedRefund,
});
