import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { OrderStatusPoller } from '@/components/checkout/order-status-poller';
import type { OrderStatusResponse } from '@/lib/checkout-api';

vi.mock('@/lib/checkout-api', () => ({
  getOrderStatus: vi.fn(),
}));

import { getOrderStatus } from '@/lib/checkout-api';
const mockGetOrderStatus = vi.mocked(getOrderStatus);

const base: OrderStatusResponse = {
  status: 'requires_action',
  shortNumber: 12,
  orderNumber: '20260627-ABC',
  total: '12.00',
  currency: 'USD',
  etaAt: null,
  fulfillmentMode: 'pickup',
  cancelReason: null,
  canceledFromStatus: null,
};

const paid: OrderStatusResponse = { ...base, status: 'paid' };
const accepted: OrderStatusResponse = {
  ...base,
  status: 'accepted',
  etaAt: '2026-06-27T18:30:00Z',
};
const completed: OrderStatusResponse = { ...base, status: 'completed' };
const failed: OrderStatusResponse = { ...base, status: 'failed' };
const declined: OrderStatusResponse = {
  ...base,
  status: 'canceled',
  canceledFromStatus: 'paid',
  cancelReason: 'kitchen_out_of_stock',
};
const canceledAfterAccept: OrderStatusResponse = {
  ...base,
  status: 'canceled',
  canceledFromStatus: 'accepted',
  cancelReason: 'guest_no_show',
};

beforeEach(() => {
  vi.useFakeTimers();
  mockGetOrderStatus.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('OrderStatusPoller', () => {
  it('shows the awaiting-payment state before payment confirms', () => {
    render(<OrderStatusPoller orderId="order-123" initialStatus={base} />);
    expect(screen.getByText('status.awaitingPayment')).toBeDefined();
  });

  it('renders the 4-step tracker once paid, with waitingAccept before an ETA exists', () => {
    render(<OrderStatusPoller orderId="order-123" initialStatus={paid} />);
    expect(screen.getByText('status.stepPaid')).toBeDefined();
    expect(screen.getByText('status.stepAccepted')).toBeDefined();
    expect(screen.getByText('status.stepPreparing')).toBeDefined();
    expect(screen.getByText('status.stepReadyPickup')).toBeDefined();
    expect(screen.getByText('status.waitingAccept')).toBeDefined();
  });

  it('renders the ETA label once etaAt is set', () => {
    render(<OrderStatusPoller orderId="order-123" initialStatus={accepted} />);
    expect(screen.getByText('status.etaLabel')).toBeDefined();
  });

  it('keeps polling past paid -- D-16 regression (paid must never be terminal)', async () => {
    mockGetOrderStatus.mockResolvedValueOnce(accepted);
    render(<OrderStatusPoller orderId="order-123" initialStatus={paid} />);

    await act(async () => {
      vi.advanceTimersByTime(5_100);
      await Promise.resolve();
    });

    expect(mockGetOrderStatus).toHaveBeenCalledWith('order-123');
    expect(screen.getByText('status.etaLabel')).toBeDefined();
  });

  it.each([completed, { ...base, status: 'canceled' }, { ...base, status: 'failed' }])(
    'does not poll when initialStatus %o is already terminal',
    (terminalStatus) => {
      render(<OrderStatusPoller orderId="order-123" initialStatus={terminalStatus} />);
      vi.advanceTimersByTime(30_000);
      expect(mockGetOrderStatus).not.toHaveBeenCalled();
    },
  );

  it('renders the payment-failed card (never the declined/canceled copy) for status=failed', () => {
    render(<OrderStatusPoller orderId="order-123" initialStatus={failed} />);
    expect(screen.getByText('status.paymentFailedTitle')).toBeDefined();
    const link = screen.getByRole<HTMLAnchorElement>('link', { name: 'status.paymentFailedRetry' });
    expect(link.href).toContain('/checkout');
  });

  it('renders the declined card + guest-safe reason when canceledFromStatus is paid', () => {
    render(<OrderStatusPoller orderId="order-123" initialStatus={declined} />);
    expect(screen.getByText('status.declinedTitle')).toBeDefined();
    expect(screen.getByText(/status\.reasons\.kitchenOutOfStock/i)).toBeDefined();
    expect(screen.getByText('status.refundLine')).toBeDefined();
  });

  it('renders the canceled (not declined) card when canceledFromStatus is post-acceptance', () => {
    render(<OrderStatusPoller orderId="order-123" initialStatus={canceledAfterAccept} />);
    expect(screen.getByText('status.canceledTitle')).toBeDefined();
    expect(screen.queryByText('status.declinedTitle')).toBeNull();
  });

  it('shows the retry affordance on a failed poll and refetches on click', async () => {
    mockGetOrderStatus.mockRejectedValueOnce(new Error('network error'));
    render(<OrderStatusPoller orderId="order-123" initialStatus={paid} />);

    await act(async () => {
      vi.advanceTimersByTime(5_100);
      await Promise.resolve();
    });

    expect(screen.getByText('status.updateFailed')).toBeDefined();
    const retryButton = screen.getByRole('button', { name: 'status.retry' });

    mockGetOrderStatus.mockResolvedValueOnce(accepted);
    await act(async () => {
      fireEvent.click(retryButton);
      await Promise.resolve();
    });

    expect(mockGetOrderStatus).toHaveBeenCalledTimes(2);
  });
});
