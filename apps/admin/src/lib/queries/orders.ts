import { apiFetch } from '@/lib/api-client';

/** How far the kitchen has taken the order. Money is `OrderPaymentState`'s business. */
export type OrderStatus = 'placed' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'canceled';

export type OrderPaymentState = 'pending' | 'requires_action' | 'paid' | 'failed' | 'refunded';

export type OrderStatusPreset =
  | 'active'
  | 'all_today'
  | 'unaccepted'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'canceled'
  | 'refund_failed';
export type OrderDatePreset = 'today' | 'yesterday' | 'week';
export type OrderChannel = 'site' | 'qr-menu';
export type OrderOrderType = 'dine_in' | 'pickup' | 'delivery';

export interface OrderFeedRowApi {
  readonly id: string;
  readonly shortNumber: number;
  readonly status: OrderStatus;
  readonly locationId: string;
  readonly locationName: string;
  readonly orderType: OrderOrderType;
  readonly tableIdentifier: string | null;
  readonly tableZoneName: string | null;
  readonly tableNumber: string | null;
  readonly customerName: string | null;
  readonly customerPhone: string | null;
  readonly paymentType: 'online' | 'cash' | 'card_on_delivery';
  readonly paymentState: OrderPaymentState;
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
  readonly from?: string;
  readonly to?: string;
  readonly orderType?: OrderOrderType;
  readonly channel?: OrderChannel;
  readonly since?: OrderFeedSinceCursor;
  readonly limit?: number;
  readonly offset?: number;
}

export const DEFAULT_ORDER_FEED_FILTERS: OrderFeedFilters = {
  statusFilter: 'unaccepted',
  datePreset: 'today',
};

const buildFeedQueryString = (filters: OrderFeedFilters): string => {
  const params = new URLSearchParams();
  if (filters.statusFilter) params.set('statusFilter', filters.statusFilter);
  if (filters.datePreset) params.set('datePreset', filters.datePreset);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.orderType) params.set('orderType', filters.orderType);
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
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  locationId: string | 'all',
  filters: OrderFeedFilters = DEFAULT_ORDER_FEED_FILTERS,
) => ({
  queryKey: ['orders', 'feed', locationId, filters] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    apiFetch<OrderFeedResponse>(buildFeedQueryString(filters), { locationId, signal }),
});

export interface OrderFeedCountsApi {
  readonly unaccepted: number;
  readonly accepted: number;
  readonly preparing: number;
  readonly ready: number;
  readonly completed: number;
  readonly canceled: number;
}

export interface OrderCountsFilters {
  readonly from?: string;
  readonly to?: string;
  readonly orderType?: OrderOrderType;
}

export const ordersCountsQuery = (
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  locationId: string | 'all',
  filters: OrderCountsFilters,
) => ({
  queryKey: ['orders', 'counts', locationId, filters] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) => {
    const params = new URLSearchParams();
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.orderType) params.set('orderType', filters.orderType);
    const qs = params.toString();
    return apiFetch<OrderFeedCountsApi>(
      qs ? `/v1/orders/feed/counts?${qs}` : '/v1/orders/feed/counts',
      { locationId, signal },
    );
  },
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
  readonly locationId: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly orderType: OrderOrderType;
  readonly tableIdentifier: string | null;
  readonly tableZoneName: string | null;
  readonly tableNumber: string | null;
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
  readonly failedRefundAmount: string | null;
  readonly failedRefundReason: string | null;
}

export const orderDetailQuery = (orderId: string, locationId: string) => ({
  queryKey: ['orders', 'detail', orderId, locationId] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    apiFetch<OrderDetailApi>(`/v1/orders/${orderId}/detail`, { locationId, signal }),
});

export type OrderSnapshotApi = Omit<OrderDetailApi, 'hasFailedRefund'>;

export interface AcceptOrderMutationInput {
  readonly orderId: string;
  readonly locationId: string;
  readonly prepMinutes: number;
}

export const acceptOrderMutation = (input: AcceptOrderMutationInput) =>
  apiFetch<OrderSnapshotApi>(`/v1/orders/${input.orderId}/accept`, {
    method: 'POST',
    body: { prepMinutes: input.prepMinutes },
    locationId: input.locationId,
  });

export interface AdvanceOrderStatusMutationInput {
  readonly orderId: string;
  readonly locationId: string;
  readonly targetStatus: 'preparing' | 'ready' | 'completed';
}

export const advanceOrderStatusMutation = (input: AdvanceOrderStatusMutationInput) =>
  apiFetch<OrderSnapshotApi>(`/v1/orders/${input.orderId}/advance`, {
    method: 'POST',
    body: { targetStatus: input.targetStatus },
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

export const cancelOrderMutation = (input: CancelOrderMutationInput) =>
  apiFetch<OrderCancelResponseApi>(`/v1/orders/${input.orderId}/cancel`, {
    method: 'POST',
    body: {
      reasonCode: input.reasonCode,
      ...(input.cancelNote !== undefined ? { cancelNote: input.cancelNote } : {}),
    },
    locationId: input.locationId,
  });

export interface RefundOrderResponseApi {
  readonly stripeRefundId: string;
  readonly amountMinor: number;
  readonly fullyRefunded: boolean;
}

export interface RefundOrderMutationInput {
  readonly orderId: string;
  readonly locationId: string;
  readonly amountMinor: number;
  readonly reason: string;
}

export const refundOrderMutation = (input: RefundOrderMutationInput) =>
  apiFetch<RefundOrderResponseApi>(`/v1/orders/${input.orderId}/refund`, {
    method: 'POST',
    body: { amountMinor: input.amountMinor, reason: input.reason },
    locationId: input.locationId,
  });

export interface RetryRefundMutationInput {
  readonly orderId: string;
  readonly locationId: string;
}

export const retryRefundMutation = (input: RetryRefundMutationInput) =>
  apiFetch<RefundOrderResponseApi>(`/v1/orders/${input.orderId}/refund/retry`, {
    method: 'POST',
    locationId: input.locationId,
  });
