import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createOrder,
  createPaymentIntent,
  getOrderStatus,
  cartItemsToOrderItems,
  CheckoutApiError,
} from '@/lib/checkout-api';
import type { CartLineItem } from '@resto/cart';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  process.env.NEXT_PUBLIC_API_ORIGIN = 'http://localhost:3000';
});

afterEach(() => {
  vi.restoreAllMocks();
});

const okJson = (body: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response);

const failJson = (status: number, body: unknown) =>
  Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  } as Response);

describe('cartItemsToOrderItems', () => {
  it('maps CartLineItem[] to order items omitting client prices', () => {
    const items: CartLineItem[] = [
      {
        itemId: 'item-1',
        sizeId: 'size-1',
        name: 'Pizza',
        unitPrice: '12.00',
        currency: 'USD',
        modifiers: [{ optionId: 'opt-1', name: 'Extra cheese', priceDelta: '1.00' }],
        quantity: 2,
      },
    ];
    const result = cartItemsToOrderItems(items);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      itemId: 'item-1',
      sizeId: 'size-1',
      name: 'Pizza',
      quantity: 2,
    });
    expect(result[0]).not.toHaveProperty('unitPrice');
    expect(result[0]).not.toHaveProperty('currency');
    const firstItem = result[0];
    const firstMod = firstItem?.modifiers[0];
    expect(firstMod).toMatchObject({ optionId: 'opt-1', name: 'Extra cheese' });
    expect(firstMod).not.toHaveProperty('priceDelta');
  });
});

describe('createOrder', () => {
  it('POSTs to /v1/orders and returns the created order', async () => {
    fetchMock.mockReturnValueOnce(
      okJson({
        orderId: 'order-123',
        orderNumber: '20260627-ABC',
        status: 'created',
        total: '12.00',
        currency: 'USD',
      }),
    );

    const result = await createOrder({
      items: [{ itemId: 'item-1', sizeId: null, name: 'Pizza', modifiers: [], quantity: 1 }],
      fulfillmentMode: 'pickup',
      customerName: 'Ann',
      customerPhone: '+1 555 0000',
      customerEmail: 'ann@example.com',
      idempotencyKey: '00000000-0000-0000-0000-000000000001',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/v1/orders');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.customerEmail).toBe('ann@example.com');
    expect(body).not.toHaveProperty('unitPrice');
    expect(result.orderId).toBe('order-123');
  });
});

describe('createPaymentIntent', () => {
  it('POSTs to /v1/checkout/payment-intent and returns clientSecret + connectedAccountId', async () => {
    fetchMock.mockReturnValueOnce(
      okJson({
        clientSecret: 'pi_test_secret',
        connectedAccountId: 'acct_test',
        orderId: 'order-123',
      }),
    );

    const result = await createPaymentIntent('order-123');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/v1/checkout/payment-intent');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ orderId: 'order-123' });
    expect(result.clientSecret).toBe('pi_test_secret');
    expect(result.connectedAccountId).toBe('acct_test');
  });

  it('throws CheckoutApiError on non-ok response', async () => {
    fetchMock.mockReturnValueOnce(
      failJson(409, { code: 'payments.not_enabled', title: 'Payments not enabled' }),
    );

    await expect(createPaymentIntent('order-123')).rejects.toBeInstanceOf(CheckoutApiError);
  });
});

describe('getOrderStatus', () => {
  it('GETs /v1/orders/:id/status and returns the status projection', async () => {
    fetchMock.mockReturnValueOnce(
      okJson({
        status: 'requires_action',
        total: '12.00',
        currency: 'USD',
        orderNumber: '20260627-ABC',
        eta: null,
      }),
    );

    const result = await getOrderStatus('order-123');

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/v1/orders/order-123/status');
    expect(result.status).toBe('requires_action');
    expect(result.total).toBe('12.00');
  });
});
