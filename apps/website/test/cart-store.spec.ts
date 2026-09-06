import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cartLineKey, useCartStore, selectSubtotal, selectItemCount } from '@resto/cart';
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

  describe('what the guest chose', () => {
    it('keeps the size and the modifiers on the line', () => {
      useCartStore.getState().addItem(
        makeItem({
          sizeId: 'size-30',
          sizeName: '30 см',
          modifiers: [{ optionId: 'o1', name: 'Тонкое', priceDelta: '0.00' }],
        }),
      );

      const [line] = useCartStore.getState().items;
      expect(line?.sizeName).toBe('30 см');
      expect(line?.modifiers[0]?.name).toBe('Тонкое');
    });

    it('keeps two sizes of one dish apart', () => {
      useCartStore.getState().addItem(makeItem({ sizeId: 'size-25', sizeName: '25 см' }));
      useCartStore.getState().addItem(makeItem({ sizeId: 'size-30', sizeName: '30 см' }));

      expect(useCartStore.getState().items).toHaveLength(2);
    });
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

  describe('the same dish with a different composition', () => {
    const bacon = { optionId: 'bacon', name: 'Бекон', priceDelta: '75.00' };
    const onion = { optionId: 'onion', name: 'Лук', priceDelta: '39.00' };

    it('keeps a pizza with bacon apart from the same pizza without it', () => {
      useCartStore.getState().addItem(makeItem());
      useCartStore.getState().addItem(makeItem({ modifiers: [bacon] }));

      const items = useCartStore.getState().items;
      expect(items).toHaveLength(2);
      expect(items.every((i) => i.quantity === 1)).toBe(true);
    });

    it('still merges when the composition matches, whatever the order', () => {
      useCartStore.getState().addItem(makeItem({ modifiers: [bacon, onion] }));
      useCartStore.getState().addItem(makeItem({ modifiers: [onion, bacon] }));

      const items = useCartStore.getState().items;
      expect(items).toHaveLength(1);
      expect(items[0]?.quantity).toBe(2);
    });

    it('treats an exclusion as part of the composition', () => {
      useCartStore.getState().addItem(makeItem({ modifiers: [] }));
      useCartStore
        .getState()
        .addItem(makeItem({ modifiers: [{ ...onion, kind: 'excluded' as const }] }));

      expect(useCartStore.getState().items).toHaveLength(2);
    });

    it('changes the quantity of one composition without touching the other', () => {
      useCartStore.getState().addItem(makeItem());
      useCartStore.getState().addItem(makeItem({ modifiers: [bacon] }));
      useCartStore.getState().addItem(makeItem({ modifiers: [bacon] }));

      useCartStore.getState().updateQuantity(cartLineKey(makeItem({ modifiers: [bacon] })), -1);

      const items = useCartStore.getState().items;
      expect(items).toHaveLength(2);
      expect(items.find((i) => i.modifiers.length === 0)?.quantity).toBe(1);
      expect(items.find((i) => i.modifiers.length === 1)?.quantity).toBe(1);
    });
  });

  describe('updateQuantity', () => {
    it('decrements quantity with delta -1', () => {
      useCartStore.getState().addItem(makeItem());
      useCartStore.getState().addItem(makeItem());
      useCartStore.getState().updateQuantity(cartLineKey(makeItem()), -1);
      expect(useCartStore.getState().items[0]?.quantity).toBe(1);
    });

    it('drops the line when quantity reaches 0', () => {
      useCartStore.getState().addItem(makeItem());
      useCartStore.getState().updateQuantity(cartLineKey(makeItem()), -1);
      expect(useCartStore.getState().items).toHaveLength(0);
    });
  });

  describe('removeItem', () => {
    it('deletes the matching line regardless of quantity', () => {
      useCartStore.getState().addItem(makeItem());
      useCartStore.getState().addItem(makeItem());
      useCartStore.getState().removeItem(cartLineKey(makeItem()));
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

  describe('cart storage key — one per guest surface (07.5-12)', () => {
    afterEach(() => {
      sessionStorage.clear();
      window.history.replaceState(null, '', '/');
    });

    it('keys the qr-menu cart apart from the storefront cart, which keeps its old key', async () => {
      window.history.replaceState(null, '', '/qr/t/abc123');
      vi.resetModules();
      const { useCartStore: qrCartStore } = await import('@resto/cart');
      qrCartStore.getState().setMode('pickup');

      window.history.replaceState(null, '', '/');
      vi.resetModules();
      const { useCartStore: storefrontCartStore } = await import('@resto/cart');
      storefrontCartStore.getState().setMode('delivery');

      const qrRaw = sessionStorage.getItem('resto-cart-qr');
      const storefrontRaw = sessionStorage.getItem('resto-cart');

      expect(qrRaw).not.toBeNull();
      expect(storefrontRaw).not.toBeNull();
      expect(qrRaw).not.toBe(storefrontRaw);
      expect((JSON.parse(qrRaw ?? '{}') as { state: { mode: string } }).state.mode).toBe('pickup');
      expect((JSON.parse(storefrontRaw ?? '{}') as { state: { mode: string } }).state.mode).toBe(
        'delivery',
      );
    });
  });
});
