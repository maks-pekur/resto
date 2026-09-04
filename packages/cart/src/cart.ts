import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CartModifier {
  readonly optionId: string;
  readonly name: string;
  readonly priceDelta: string;
  readonly modifierGroupId?: string;
  readonly amount?: number;
  readonly kind?: 'added' | 'excluded';
}

/**
 * Two lines are the same line only when the guest would receive the same thing: a pizza with
 * bacon and one without are different dishes to the kitchen, and merging them loses a choice
 * the guest made. Modifier order is not part of the identity, so it is sorted away.
 */
export const cartLineKey = (line: {
  readonly itemId: string;
  readonly sizeId: string | null;
  readonly modifiers: readonly CartModifier[];
}): string =>
  [
    line.itemId,
    line.sizeId ?? '',
    ...line.modifiers
      .map((m) => `${m.kind ?? 'added'}:${m.optionId}:${String(m.amount ?? 1)}`)
      .sort(),
  ].join('|');

export interface CartLineItem {
  readonly itemId: string;
  readonly sizeId: string | null;
  readonly name: string;
  readonly unitPrice: string;
  readonly currency: string;
  /** Kept on the line: the cart outlives the menu payload it was built from. */
  readonly imageUrl?: string | null;
  /** The size the guest chose, spelled out — `sizeId` alone means nothing to a reader. */
  readonly sizeName?: string | null;
  readonly modifiers: readonly CartModifier[];
  quantity: number;
}

export interface ResolvedCartTable {
  readonly tableId: string;
  readonly zoneName: string;
  readonly number: string;
}

interface CartState {
  readonly mode: 'delivery' | 'pickup' | null;
  readonly items: CartLineItem[];
  readonly tableId: string | null;
  readonly tableZoneName: string | null;
  readonly tableNumber: string | null;
  setMode: (mode: 'delivery' | 'pickup') => void;
  setTable: (table: ResolvedCartTable | null) => void;
  addItem: (item: Omit<CartLineItem, 'quantity'>) => void;
  updateQuantity: (lineKey: string, delta: number) => void;
  removeItem: (lineKey: string) => void;
  clearCart: () => void;
}

export function parseMinorUnits(value: string): number {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = '0', frac = ''] = unsigned.split('.');
  const fracPadded = frac.padEnd(2, '0').slice(0, 2);
  const minor = parseInt(whole, 10) * 100 + parseInt(fracPadded, 10);
  return negative ? -minor : minor;
}

export function formatMinorUnits(minor: number): string {
  const whole = Math.floor(minor / 100);
  const frac = Math.abs(minor % 100)
    .toString()
    .padStart(2, '0');
  return `${whole.toString()}.${frac}`;
}

export function selectSubtotal(state: CartState): string {
  let total = 0;
  for (const item of state.items) {
    let lineCost = parseMinorUnits(item.unitPrice);
    for (const mod of item.modifiers) {
      lineCost += parseMinorUnits(mod.priceDelta);
    }
    total += lineCost * item.quantity;
  }
  return formatMinorUnits(total);
}

export function selectItemCount(state: CartState): number {
  return state.items.reduce((sum, item) => sum + item.quantity, 0);
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      mode: null,
      items: [],
      tableId: null,
      tableZoneName: null,
      tableNumber: null,
      setMode: (mode) => set({ mode }),
      setTable: (table) =>
        set(
          table
            ? { tableId: table.tableId, tableZoneName: table.zoneName, tableNumber: table.number }
            : { tableId: null, tableZoneName: null, tableNumber: null },
        ),
      addItem: (newItem) =>
        set((state) => {
          const key = cartLineKey(newItem);
          const existing = state.items.find((i) => cartLineKey(i) === key);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i === existing
                  ? {
                      ...i,
                      // A line stored before the menu carried an image would otherwise never get
                      // one: adding the same dish again only ever bumped the quantity.
                      ...(i.imageUrl == null && newItem.imageUrl != null
                        ? { imageUrl: newItem.imageUrl }
                        : {}),
                      quantity: i.quantity + 1,
                    }
                  : i,
              ),
            };
          }
          return { items: [...state.items, { ...newItem, quantity: 1 }] };
        }),
      updateQuantity: (lineKey, delta) =>
        set((state) => ({
          items: state.items
            .map((i) => (cartLineKey(i) === lineKey ? { ...i, quantity: i.quantity + delta } : i))
            .filter((i) => i.quantity > 0),
        })),
      removeItem: (lineKey) =>
        set((state) => ({
          items: state.items.filter((i) => cartLineKey(i) !== lineKey),
        })),
      clearCart: () => set({ items: [] }),
    }),
    {
      name: 'resto-cart',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
