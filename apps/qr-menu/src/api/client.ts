import type { LegalDocumentsDto, MenuDto, VenueDto } from '@resto/api-client/public';

export class MenuNotFoundError extends Error {
  constructor() {
    super('Menu not found for this tenant.');
    this.name = 'MenuNotFoundError';
  }
}

export const fetchMenu = async (signal?: AbortSignal): Promise<MenuDto> => {
  const init: RequestInit = {};
  if (signal) init.signal = signal;
  const res = await fetch('/v1/menu', init);
  if (res.status === 404) throw new MenuNotFoundError();
  if (!res.ok) throw new Error(`fetchMenu failed: ${res.status.toString()}`);
  return res.json() as Promise<MenuDto>;
};

export const fetchVenue = async (signal?: AbortSignal): Promise<VenueDto | null> => {
  const res = await fetch('/v1/venue', { ...(signal ? { signal } : {}) });
  if (!res.ok) return null;
  return res.json() as Promise<VenueDto>;
};

export const fetchLegalDocuments = async (
  signal?: AbortSignal,
): Promise<LegalDocumentsDto | null> => {
  const res = await fetch('/v1/legal', { ...(signal ? { signal } : {}) });
  if (!res.ok) return null;
  return res.json() as Promise<LegalDocumentsDto>;
};

export const requestService = async (kind: 'waiter' | 'bill'): Promise<boolean> => {
  const res = await fetch('/v1/tables/service-request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind }),
  });
  return res.ok;
};

export interface MenuAvailability {
  stoppedItemIds: string[];
  stoppedIngredientIds: string[];
}

export const fetchAvailability = async (
  tableId: string | undefined,
  signal?: AbortSignal,
): Promise<MenuAvailability> => {
  const init: RequestInit = {};
  if (signal) init.signal = signal;
  const params = new URLSearchParams();
  if (tableId) params.set('t', tableId);
  const query = params.toString();
  const url = query ? `/v1/menu/availability?${query}` : '/v1/menu/availability';
  const res = await fetch(url, init);
  if (res.status === 404) return { stoppedItemIds: [], stoppedIngredientIds: [] };
  if (!res.ok) throw new Error(`fetchAvailability failed: ${res.status.toString()}`);
  return res.json() as Promise<MenuAvailability>;
};

export interface ResolvedTable {
  tableId: string;
  zoneName: string;
  number: string;
}

export const fetchTable = async (
  tableId: string,
  signal?: AbortSignal,
): Promise<ResolvedTable | null> => {
  const init: RequestInit = {};
  if (signal) init.signal = signal;
  const res = await fetch(`/v1/tables/${tableId}`, init);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`fetchTable failed: ${res.status.toString()}`);
  return res.json() as Promise<ResolvedTable>;
};

export interface PlaceOrderItem {
  readonly itemId: string;
  readonly sizeId: string | null;
  readonly name: string;
  readonly quantity: number;
  readonly modifiers: readonly {
    readonly optionId: string;
    readonly name: string;
    readonly amount?: number;
  }[];
}

export interface PlacedOrder {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly total: string;
  readonly currency: string;
}

export interface OrderStatus {
  readonly status: 'placed' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'canceled';
  readonly paymentStatus: 'pending' | 'requires_action' | 'paid' | 'failed' | 'refunded';
  readonly shortNumber: number | null;
  readonly orderNumber: string;
  readonly total: string;
  readonly currency: string;
  readonly etaAt: string | null;
  readonly orderType: 'dine_in' | 'pickup' | 'delivery';
  readonly cancelReason: string | null;
  readonly canceledFromStatus: string | null;
  readonly reviewed: boolean;
}

export const submitOrderFeedback = async (
  orderId: string,
  input: { rating: number; comment: string | null },
): Promise<boolean> => {
  const res = await fetch(`/v1/orders/${orderId}/feedback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return res.ok;
};

export class OrderRequestError extends Error {
  constructor(readonly code: string) {
    super(`order request failed: ${code}`);
    this.name = 'OrderRequestError';
  }
}

const postJson = async <T>(path: string, body: unknown): Promise<T> => {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const problem = (await res.json().catch(() => null)) as { code?: string } | null;
    throw new OrderRequestError(problem?.code ?? `http_${res.status.toString()}`);
  }
  return res.json() as Promise<T>;
};

export interface PlaceOrderInput {
  readonly items: readonly PlaceOrderItem[];
  readonly paymentType: 'online' | 'cash';
  readonly customerName?: string;
  readonly customerPhone?: string;
  readonly idempotencyKey: string;
}

/** No table travels with the order: the server reads it from the session the scan opened. */
export const placeOrder = (input: PlaceOrderInput): Promise<PlacedOrder> =>
  postJson<PlacedOrder>('/v1/orders', {
    ...input,
    orderType: 'dine_in',
    channel: 'qr-menu',
    marketingConsent: false,
  });

export const startPayment = (
  orderId: string,
): Promise<{ clientSecret: string; connectedAccountId: string }> =>
  postJson('/v1/checkout/payment-intent', { orderId });

/** Exchange the secret from a scanned code for a table session cookie. */
export const openTableSession = (token: string): Promise<ResolvedTable> =>
  postJson<ResolvedTable>('/v1/tables/session', { token });

export const fetchTableSession = async (signal?: AbortSignal): Promise<ResolvedTable | null> => {
  const init: RequestInit = {};
  if (signal) init.signal = signal;
  const res = await fetch('/v1/tables/session', init);
  if (res.status === 404) return null;
  if (!res.ok) throw new OrderRequestError(`http_${res.status.toString()}`);
  return res.json() as Promise<ResolvedTable>;
};

export const fetchOrderStatus = async (
  orderId: string,
  signal?: AbortSignal,
): Promise<OrderStatus> => {
  const init: RequestInit = {};
  if (signal) init.signal = signal;
  const res = await fetch(`/v1/orders/${orderId}/status`, init);
  if (!res.ok) throw new OrderRequestError(`http_${res.status.toString()}`);
  return res.json() as Promise<OrderStatus>;
};
