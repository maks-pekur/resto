import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { OrderStatusPoller } from '@/components/checkout/order-status-poller';
import type { OrderStatusResponse } from '@/lib/checkout-api';

vi.mock('@/lib/checkout-api', () => ({
  getOrderStatus: vi.fn(),
}));

import { getOrderStatus } from '@/lib/checkout-api';
const mockGetOrderStatus = vi.mocked(getOrderStatus);

const pending: OrderStatusResponse = {
  status: 'requires_action',
  total: '12.00',
  currency: 'USD',
  orderNumber: '20260627-ABC',
  eta: null,
};

const paid: OrderStatusResponse = { ...pending, status: 'paid' };
const failed: OrderStatusResponse = { ...pending, status: 'failed' };

beforeEach(() => {
  vi.useFakeTimers();
  mockGetOrderStatus.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('OrderStatusPoller', () => {
  it('shows confirming state when status is pending', () => {
    render(<OrderStatusPoller orderId="order-123" initialStatus={pending} />);
    expect(screen.getByText('Confirming payment…')).toBeDefined();
    expect(screen.getByText('#20260627-ABC', { exact: false })).toBeDefined();
    expect(screen.getByText(/12\.00/)).toBeDefined();
  });

  it('shows confirmed state immediately when initialStatus is paid', () => {
    render(<OrderStatusPoller orderId="order-123" initialStatus={paid} />);
    expect(screen.getByText('Payment confirmed')).toBeDefined();
    expect(mockGetOrderStatus).not.toHaveBeenCalled();
  });

  it('shows failure state when initialStatus is failed', () => {
    render(<OrderStatusPoller orderId="order-123" initialStatus={failed} />);
    expect(screen.getByText(/Payment could not be completed/)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Try again' })).toBeDefined();
    expect(mockGetOrderStatus).not.toHaveBeenCalled();
  });

  it('polls until paid and flips to confirmed', async () => {
    mockGetOrderStatus.mockResolvedValueOnce(paid);

    render(<OrderStatusPoller orderId="order-123" initialStatus={pending} />);
    expect(screen.getByText('Confirming payment…')).toBeDefined();

    await act(async () => {
      vi.advanceTimersByTime(1_100);
      await Promise.resolve();
    });

    expect(mockGetOrderStatus).toHaveBeenCalledWith('order-123');
    expect(screen.getByText('Payment confirmed')).toBeDefined();
  });

  it('does not poll when initialStatus is already terminal', () => {
    render(<OrderStatusPoller orderId="order-123" initialStatus={paid} />);
    vi.advanceTimersByTime(30_000);
    expect(mockGetOrderStatus).not.toHaveBeenCalled();
  });

  it('retry link on failure points back to /checkout', () => {
    render(<OrderStatusPoller orderId="order-123" initialStatus={failed} />);
    const link = screen.getByRole<HTMLAnchorElement>('link', { name: 'Try again' });
    expect(link.href).toContain('/checkout');
  });
});
