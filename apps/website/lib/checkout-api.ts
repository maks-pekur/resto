import type { CartLineItem } from '@resto/cart';

const getApiOrigin = (): string => {
  const origin = process.env.NEXT_PUBLIC_API_ORIGIN;
  if (!origin) {
    throw new Error('NEXT_PUBLIC_API_ORIGIN is not set');
  }
  return origin;
};

export interface CreateOrderInput {
  items: {
    itemId: string;
    sizeId: string | null;
    name: string;
    modifiers: { optionId: string; name: string; amount?: number }[];
    quantity: number;
  }[];
  orderType: 'dine_in' | 'pickup' | 'delivery';
  table?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  idempotencyKey: string;
  scheduledFor?: string;
  marketingConsent?: boolean;
}

export interface CreateOrderResponse {
  orderId: string;
  orderNumber: string;
  status: string;
  total: string;
  currency: string;
}

export interface CreatePaymentIntentResponse {
  clientSecret: string;
  connectedAccountId: string;
  orderId: string;
}

export interface OrderStatusResponse {
  status: string;
  shortNumber: number | null;
  orderNumber: string;
  total: string;
  currency: string;
  etaAt: string | null;
  orderType: 'dine_in' | 'pickup' | 'delivery';
  cancelReason: string | null;
  canceledFromStatus: string | null;
}

export class CheckoutApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CheckoutApiError';
  }
}

async function apiFetch<T>(
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
  host?: string,
): Promise<T> {
  const resolvedHost = host ?? (typeof window !== 'undefined' ? window.location.host : '');
  const { headers: _ignored, ...rest } = init;
  const res = await fetch(`${getApiOrigin()}${path}`, {
    ...rest,
    signal: signal ?? AbortSignal.timeout(30_000),
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-host': resolvedHost,
    },
  });

  if (!res.ok) {
    let code = 'unknown';
    let message = `Request failed with status ${res.status.toString()}`;
    try {
      const body = (await res.json()) as { code?: string; message?: string; title?: string };
      code = body.code ?? code;
      message = body.message ?? body.title ?? message;
    } catch (_err) {
      void _err;
    }
    throw new CheckoutApiError(res.status, code, message);
  }

  return res.json() as Promise<T>;
}

export function cartItemsToOrderItems(items: CartLineItem[]): CreateOrderInput['items'] {
  return items.map((item) => ({
    itemId: item.itemId,
    sizeId: item.sizeId,
    name: item.name,
    modifiers: item.modifiers.map((m) => ({
      optionId: m.optionId,
      name: m.name,
      ...(m.amount !== undefined ? { amount: m.amount } : {}),
    })),
    quantity: item.quantity,
  }));
}

export const createOrder = (
  input: CreateOrderInput,
  signal?: AbortSignal,
): Promise<CreateOrderResponse> =>
  apiFetch<CreateOrderResponse>(
    '/v1/orders',
    { method: 'POST', body: JSON.stringify(input) },
    signal,
  );

export const createPaymentIntent = (
  orderId: string,
  signal?: AbortSignal,
): Promise<CreatePaymentIntentResponse> =>
  apiFetch<CreatePaymentIntentResponse>(
    '/v1/checkout/payment-intent',
    { method: 'POST', body: JSON.stringify({ orderId }) },
    signal,
  );

export const getOrderStatus = (
  orderId: string,
  signal?: AbortSignal,
  host?: string,
): Promise<OrderStatusResponse> =>
  apiFetch<OrderStatusResponse>(`/v1/orders/${orderId}/status`, { method: 'GET' }, signal, host);
