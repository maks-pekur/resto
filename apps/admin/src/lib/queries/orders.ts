import { apiFetch } from '@/lib/api-client';

export type OrderStatus =
  | 'created'
  | 'requires_action'
  | 'paid'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'canceled'
  | 'refunded'
  | 'failed';

export type OrderStatusPreset = 'active' | 'all_today' | 'completed' | 'canceled' | 'refund_failed';
export type OrderDatePreset = 'today' | 'yesterday' | 'week';
export type OrderChannel = 'site' | 'qr-menu';
export type OrderFulfillmentMode = 'dine_in' | 'pickup' | 'delivery';

export interface OrderFeedRowApi {
  readonly id: string;
  readonly shortNumber: number;
  readonly status: OrderStatus;
  readonly locationId: string;
  readonly locationName: string;
  readonly fulfillmentMode: OrderFulfillmentMode;
  readonly tableIdentifier: string | null;
  readonly total: string;
  readonly currency: string;
  readonly itemCount: number;
  readonly channel: OrderChannel;
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

export interface OrderFeedResponse {
  readonly rows: readonly OrderFeedRowApi[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface OrderFeedSinceCursor {
  readonly createdAt: string;
  readonly id: string;
}

export interface OrderFeedFilters {
  readonly statusFilter?: OrderStatusPreset;
  readonly datePreset?: OrderDatePreset;
  readonly channel?: OrderChannel;
  readonly since?: OrderFeedSinceCursor;
  readonly limit?: number;
  readonly offset?: number;
}

export const DEFAULT_ORDER_FEED_FILTERS: OrderFeedFilters = {
  statusFilter: 'active',
  datePreset: 'today',
};

const buildFeedQueryString = (filters: OrderFeedFilters): string => {
  const params = new URLSearchParams();
  if (filters.statusFilter) params.set('statusFilter', filters.statusFilter);
  if (filters.datePreset) params.set('datePreset', filters.datePreset);
  if (filters.channel) params.set('channel', filters.channel);
  if (filters.since) {
    params.set('sinceCreatedAt', filters.since.createdAt);
    params.set('sinceId', filters.since.id);
  }
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.offset !== undefined) params.set('offset', String(filters.offset));
  const qs = params.toString();
  return qs ? `/v1/orders/feed?${qs}` : '/v1/orders/feed';
};

export const ordersFeedQuery = (
  brandSlug: string,
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  locationId: string | 'all',
  filters: OrderFeedFilters = DEFAULT_ORDER_FEED_FILTERS,
) => ({
  queryKey: ['orders', 'feed', brandSlug, locationId, filters] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    apiFetch<OrderFeedResponse>(buildFeedQueryString(filters), { brandSlug, locationId, signal }),
});

export interface OrderModifierApi {
  readonly optionId: string;
  readonly nameSnapshot: string;
  readonly priceDelta: string;
  readonly amount: number;
  readonly modifierGroupId: string | null;
}

export interface OrderItemApi {
  readonly id: string;
  readonly menuItemId: string;
  readonly nameSnapshot: string;
  readonly unitPrice: string;
  readonly currency: string;
  readonly modifiers: readonly OrderModifierApi[];
  readonly quantity: number;
  readonly lineTotal: string;
  readonly categoryId: string;
}

export interface OrderDetailApi {
  readonly id: string;
  readonly tenantId: string;
  readonly brandId: string;
  readonly locationId: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly fulfillmentMode: OrderFulfillmentMode;
  readonly tableIdentifier: string | null;
  readonly customerName: string | null;
  readonly customerPhone: string | null;
  readonly customerEmail: string | null;
  readonly items: readonly OrderItemApi[];
  readonly subtotal: string;
  readonly deliveryFee: string;
  readonly serviceFee: string;
  readonly discount: string;
  readonly total: string;
  readonly currency: string;
  readonly scheduledFor: string | null;
  readonly shortNumber: number;
  readonly channel: OrderChannel;
  readonly acceptedAt: string | null;
  readonly preparingAt: string | null;
  readonly readyAt: string | null;
  readonly completedAt: string | null;
  readonly canceledAt: string | null;
  readonly acceptedByUserId: string | null;
  readonly canceledByUserId: string | null;
  readonly cancelReason: string | null;
  readonly cancelNote: string | null;
  readonly canceledFromStatus: OrderStatus | null;
  readonly etaAt: string | null;
  readonly marketingConsent: boolean;
  readonly marketingConsentAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly hasFailedRefund: boolean;
}

export const orderDetailQuery = (brandSlug: string, orderId: string, locationId: string) => ({
  queryKey: ['orders', 'detail', brandSlug, orderId, locationId] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    apiFetch<OrderDetailApi>(`/v1/orders/${orderId}/detail`, { brandSlug, locationId, signal }),
});

export type OrderSnapshotApi = Omit<OrderDetailApi, 'hasFailedRefund'>;

export interface AcceptOrderMutationInput {
  readonly orderId: string;
  readonly locationId: string;
  readonly prepMinutes: number;
}

export const acceptOrderMutation = (brandSlug: string, input: AcceptOrderMutationInput) =>
  apiFetch<OrderSnapshotApi>(`/v1/orders/${input.orderId}/accept`, {
    method: 'POST',
    body: { prepMinutes: input.prepMinutes },
    brandSlug,
    locationId: input.locationId,
  });

export interface AdvanceOrderStatusMutationInput {
  readonly orderId: string;
  readonly locationId: string;
  readonly targetStatus: 'preparing' | 'ready' | 'completed';
}

export const advanceOrderStatusMutation = (
  brandSlug: string,
  input: AdvanceOrderStatusMutationInput,
) =>
  apiFetch<OrderSnapshotApi>(`/v1/orders/${input.orderId}/advance`, {
    method: 'POST',
    body: { targetStatus: input.targetStatus },
    brandSlug,
    locationId: input.locationId,
  });

export interface OrderCancelRefundApi {
  readonly attempted: boolean;
  readonly outcome: 'succeeded' | 'failed' | 'none';
  readonly amountMinor: number | null;
}

export interface OrderCancelResponseApi {
  readonly canceled: true;
  readonly refund: OrderCancelRefundApi;
}

export interface CancelOrderMutationInput {
  readonly orderId: string;
  readonly locationId: string;
  readonly reasonCode: string;
  readonly cancelNote?: string;
}

export const cancelOrderMutation = (brandSlug: string, input: CancelOrderMutationInput) =>
  apiFetch<OrderCancelResponseApi>(`/v1/orders/${input.orderId}/cancel`, {
    method: 'POST',
    body: {
      reasonCode: input.reasonCode,
      ...(input.cancelNote !== undefined ? { cancelNote: input.cancelNote } : {}),
    },
    brandSlug,
    locationId: input.locationId,
  });
