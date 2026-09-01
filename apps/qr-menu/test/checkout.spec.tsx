import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useCartStore } from '@resto/cart';

const placeOrder = vi.fn();
vi.mock('../src/api/client', () => ({
  placeOrder,
  openTableSession: vi.fn(),
  OrderRequestError: class extends Error {},
}));

vi.mock('../src/i18n', () => ({
  t: (key: string) => key,
  getActiveLocale: () => 'ru',
}));

const { CheckoutSheet } = await import('../src/components/CheckoutSheet');

const line = {
  itemId: 'item-1',
  sizeId: 'size-30',
  sizeName: '30 см',
  name: 'Пепперони',
  unitPrice: '239.00',
  currency: 'UAH',
  modifiers: [{ optionId: 'o1', name: 'Тонкое', priceDelta: '0.00' }],
};

const renderSheet = () => {
  const onPlaced = vi.fn();
  render(<CheckoutSheet open onOpenChange={vi.fn()} currency="UAH" onPlaced={onPlaced} />);
  return onPlaced;
};

describe('CheckoutSheet', () => {
  beforeEach(() => {
    placeOrder.mockReset();
    placeOrder.mockResolvedValue({
      orderId: 'order-1',
      orderNumber: '20260901-AB',
      total: '239.00',
      currency: 'UAH',
    });
    useCartStore.setState({ items: [], tableId: null, tableZoneName: null, tableNumber: null });
    useCartStore.getState().addItem(line);
  });

  it('sends the cart and the payment the guest chose — the table comes from their session', async () => {
    const onPlaced = renderSheet();

    fireEvent.click(screen.getByRole('button', { name: /checkout.place/u }));

    await waitFor(() => {
      expect(placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentType: 'online',
          items: [expect.objectContaining({ itemId: 'item-1', sizeId: 'size-30', quantity: 1 })],
        }),
      );
    });
    await waitFor(() => {
      expect(onPlaced).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'order-1' }),
        'online',
      );
    });
  });

  it('records paying at the table when that is what the guest picked', async () => {
    const onPlaced = renderSheet();

    fireEvent.click(screen.getByRole('radio', { name: /checkout.payment.cash/u }));
    fireEvent.click(screen.getByRole('button', { name: /checkout.place/u }));

    await waitFor(() => {
      expect(placeOrder).toHaveBeenCalledWith(expect.objectContaining({ paymentType: 'cash' }));
    });
    await waitFor(() => {
      expect(onPlaced).toHaveBeenCalledWith(expect.anything(), 'cash');
    });
  });

  it('empties the cart once the order is on its way to the kitchen', async () => {
    renderSheet();

    fireEvent.click(screen.getByRole('button', { name: /checkout.place/u }));

    await waitFor(() => {
      expect(useCartStore.getState().items).toHaveLength(0);
    });
  });

  it('keeps the cart when the order is refused', async () => {
    placeOrder.mockRejectedValue(new Error('nope'));
    renderSheet();

    fireEvent.click(screen.getByRole('button', { name: /checkout.place/u }));

    await screen.findByText('checkout.failed');
    expect(useCartStore.getState().items).toHaveLength(1);
  });
});
