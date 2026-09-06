import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const fetchOrderStatus = vi.fn();
const submitOrderFeedback = vi.fn();

vi.mock('../src/api/client', () => ({
  fetchOrderStatus,
  submitOrderFeedback,
  startPayment: vi.fn(),
}));

vi.mock('../src/i18n', () => ({
  t: (key: string) => key,
  getActiveLocale: () => 'ru',
}));

const { OrderStatusSheet } = await import('../src/components/OrderStatusSheet');

const order = {
  orderId: 'order-1',
  orderNumber: '20260902-AA',
  total: '239.00',
  currency: 'UAH',
};

const statusOf = (over: Record<string, unknown> = {}) => ({
  status: 'completed',
  paymentStatus: 'paid',
  shortNumber: 7,
  orderNumber: order.orderNumber,
  total: order.total,
  currency: order.currency,
  etaAt: null,
  orderType: 'dine_in',
  cancelReason: null,
  canceledFromStatus: null,
  reviewed: false,
  ...over,
});

const renderSheet = () =>
  render(<OrderStatusSheet open onOpenChange={vi.fn()} order={order} payment="cash" />);

describe('reviewing an order', () => {
  beforeEach(() => {
    fetchOrderStatus.mockReset();
    submitOrderFeedback.mockReset().mockResolvedValue(true);
  });

  it('asks only once the order has been served', async () => {
    fetchOrderStatus.mockResolvedValue(statusOf({ status: 'preparing', paymentStatus: 'paid' }));
    renderSheet();

    await screen.findByText('order.stagePreparing');
    expect(screen.queryByText('review.title')).not.toBeInTheDocument();
  });

  it('sends the rating with the comment and thanks the guest', async () => {
    fetchOrderStatus.mockResolvedValue(statusOf());
    renderSheet();

    fireEvent.click(await screen.findByTestId('review-rating-5'));
    fireEvent.change(screen.getByPlaceholderText('review.commentPlaceholder'), {
      target: { value: 'Пицца была отличная' },
    });
    fireEvent.click(screen.getByText('review.send'));

    await waitFor(() => {
      expect(submitOrderFeedback).toHaveBeenCalledWith('order-1', {
        rating: 5,
        comment: 'Пицца была отличная',
      });
    });
    expect(await screen.findByText('review.thanks')).toBeInTheDocument();
  });

  it('does not ask twice for the same order', async () => {
    fetchOrderStatus.mockResolvedValue(statusOf({ reviewed: true }));
    renderSheet();

    expect(await screen.findByText('review.thanks')).toBeInTheDocument();
    expect(screen.queryByTestId('review-rating-5')).not.toBeInTheDocument();
  });
});
