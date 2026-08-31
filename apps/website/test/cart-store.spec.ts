import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore, selectSubtotal, selectItemCount } from '@resto/cart';
import type { CartLineItem } from '@resto/cart';

function makeItem(
  overrides: Partial<Omit<CartLineItem, 'quantity'>> = {},
): Omit<CartLineItem, 'quantity'> {
  return {
    itemId: 'item-1',
    sizeId: null,
    name: 'Burger',
    unitPrice: '10.00',
    currency: 'USD',
    modifiers: [],
    ...overrides,
  };
}

describe('cart store', () => {
  beforeEach(() => {
    useCartStore.setState({ mode: null, items: [] });
  });

  describe('the line photo', () => {
    it('keeps the photo the guest saw when they picked the dish', () => {
      useCartStore.getState().addItem(makeItem({ imageUrl: 'https://cdn/burger.webp' }));

      expect(useCartStore.getState().items[0]?.imageUrl).toBe('https://cdn/burger.webp');
    });

    it('fills in a photo a line stored before the menu carried one never had', () => {
      useCartStore.getState().addItem(makeItem());
      useCartStore.getState().addItem(makeItem({ imageUrl: 'https://cdn/burger.webp' }));

      const [line] = useCartStore.getState().items;
      expect(line?.quantity).toBe(2);
      expect(line?.imageUrl).toBe('https://cdn/burger.webp');
    });
  });

  describe('addItem', () => {
    it('appends a new line at quantity 1 for a new itemId+sizeId', () => {
      useCartStore.getState().addItem(makeItem());
      const { items } = useCartStore.getState();
      expect(items).toHaveLength(1);
      expect(items[0]?.quantity).toBe(1);
      expect(items[0]?.itemId).toBe('item-1');
    });

    it('increments quantity when same itemId+sizeId already exists', () => {
      useCartStore.getState().addItem(makeItem());
      useCartStore.getState().addItem(makeItem());
      const { items } = useCartStore.getState();
      expect(items).toHaveLength(1);
      expect(items[0]?.quantity).toBe(2);
    });

    it('adds separate lines for different sizeIds of the same item', () => {
      useCartStore.getState().addItem(makeItem({ sizeId: 'size-sm' }));
      useCartStore.getState().addItem(makeItem({ sizeId: 'size-lg' }));
      const { items } = useCartStore.getState();
      expect(items).toHaveLength(2);
    });
  });

  describe('updateQuantity', () => {
    it('decrements quantity with delta -1', () => {
      useCartStore.getState().addItem(makeItem());
      useCartStore.getState().addItem(makeItem());
      useCartStore.getState().updateQuantity('item-1', null, -1);
      expect(useCartStore.getState().items[0]?.quantity).toBe(1);
    });

    it('drops the line when quantity reaches 0', () => {
      useCartStore.getState().addItem(makeItem());
      useCartStore.getState().updateQuantity('item-1', null, -1);
      expect(useCartStore.getState().items).toHaveLength(0);
    });
  });

  describe('removeItem', () => {
    it('deletes the matching line regardless of quantity', () => {
      useCartStore.getState().addItem(makeItem());
      useCartStore.getState().addItem(makeItem());
      useCartStore.getState().removeItem('item-1', null);
      expect(useCartStore.getState().items).toHaveLength(0);
    });
  });

  describe('setMode', () => {
    it('sets delivery mode', () => {
      useCartStore.getState().setMode('delivery');
      expect(useCartStore.getState().mode).toBe('delivery');
    });

    it('sets pickup mode', () => {
      useCartStore.getState().setMode('pickup');
      expect(useCartStore.getState().mode).toBe('pickup');
    });
  });

  describe('clearCart', () => {
    it('empties items but preserves mode', () => {
      useCartStore.getState().setMode('delivery');
      useCartStore.getState().addItem(makeItem());
      useCartStore.getState().clearCart();
      const state = useCartStore.getState();
      expect(state.items).toHaveLength(0);
      expect(state.mode).toBe('delivery');
    });
  });

  describe('selectSubtotal', () => {
    it('sums unitPrice * quantity for each line', () => {
      useCartStore.getState().addItem(makeItem({ unitPrice: '5.00' }));
      useCartStore.getState().addItem(makeItem({ unitPrice: '5.00' }));
      const subtotal = selectSubtotal(useCartStore.getState());
      expect(subtotal).toBe('10.00');
    });

    it('includes modifier priceDelta in the subtotal', () => {
      useCartStore.getState().addItem(
        makeItem({
          unitPrice: '10.00',
          modifiers: [
            { modifierGroupId: 'g-1', optionId: 'o-1', name: 'Extra sauce', priceDelta: '1.50' },
          ],
        }),
      );
      const subtotal = selectSubtotal(useCartStore.getState());
      expect(subtotal).toBe('11.50');
    });

    it('computes subtotal without floating-point drift (0.1 + 0.2 case)', () => {
      useCartStore.getState().addItem(makeItem({ unitPrice: '0.10' }));
      useCartStore.getState().addItem(makeItem({ itemId: 'item-2', unitPrice: '0.20' }));
      const subtotal = selectSubtotal(useCartStore.getState());
      expect(subtotal).toBe('0.30');
    });
  });

  describe('selectItemCount', () => {
    it('returns total quantity across all lines', () => {
      useCartStore.getState().addItem(makeItem({ itemId: 'item-1' }));
      useCartStore.getState().addItem(makeItem({ itemId: 'item-1' }));
      useCartStore.getState().addItem(makeItem({ itemId: 'item-2' }));
      expect(selectItemCount(useCartStore.getState())).toBe(3);
    });

    it('returns 0 for an empty cart', () => {
      expect(selectItemCount(useCartStore.getState())).toBe(0);
    });
  });
});
