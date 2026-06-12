import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CartModifier {
  readonly optionId: string;
  readonly name: string;
  readonly priceDelta: string;
  readonly modifierGroupId?: string;
  readonly amount?: number;
}

export interface CartLineItem {
  readonly itemId: string;
  readonly sizeId: string | null;
  readonly name: string;
  readonly unitPrice: string;
  readonly currency: string;
  readonly modifiers: readonly CartModifier[];
  quantity: number;
}

interface CartState {
  readonly mode: 'delivery' | 'pickup' | null;
  readonly items: CartLineItem[];
  readonly table: string | null;
  setMode: (mode: 'delivery' | 'pickup') => void;
  setTable: (table: string | null) => void;
  addItem: (item: Omit<CartLineItem, 'quantity'>) => void;
  updateQuantity: (itemId: string, sizeId: string | null, delta: number) => void;
  removeItem: (itemId: string, sizeId: string | null) => void;
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
      table: null,
      setMode: (mode) => set({ mode }),
      setTable: (table) => set({ table }),
      addItem: (newItem) =>
        set((state) => {
          const existing = state.items.find(
            (i) => i.itemId === newItem.itemId && i.sizeId === newItem.sizeId,
          );
          if (existing) {
            return {
              items: state.items.map((i) =>
                i === existing ? { ...i, quantity: i.quantity + 1 } : i,
              ),
            };
          }
          return { items: [...state.items, { ...newItem, quantity: 1 }] };
        }),
      updateQuantity: (itemId, sizeId, delta) =>
        set((state) => ({
          items: state.items
            .map((i) =>
              i.itemId === itemId && i.sizeId === sizeId
                ? { ...i, quantity: i.quantity + delta }
                : i,
            )
            .filter((i) => i.quantity > 0),
        })),
      removeItem: (itemId, sizeId) =>
        set((state) => ({
          items: state.items.filter((i) => !(i.itemId === itemId && i.sizeId === sizeId)),
        })),
      clearCart: () => set({ items: [] }),
    }),
    {
      name: 'resto-cart',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
