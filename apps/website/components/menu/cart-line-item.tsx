'use client';

import { Minus, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCartStore, selectSubtotal } from '@/hooks/use-cart-store';
import type { CartLineItem as CartLineItemType } from '@resto/cart';
import { selectItemCount } from '@resto/cart';

function parseMinorUnits(value: string): number {
  const [whole = '0', frac = ''] = value.split('.');
  const fracPadded = frac.padEnd(2, '0').slice(0, 2);
  return parseInt(whole, 10) * 100 + parseInt(fracPadded, 10);
}

function formatMinorUnits(minor: number): string {
  const whole = Math.floor(minor / 100);
  const frac = Math.abs(minor % 100)
    .toString()
    .padStart(2, '0');
  return `${whole.toString()}.${frac}`;
}

function lineTotal(item: CartLineItemType): string {
  let cost = parseMinorUnits(item.unitPrice);
  for (const mod of item.modifiers) {
    cost += parseMinorUnits(mod.priceDelta);
  }
  return formatMinorUnits(cost * item.quantity);
}

interface CartLineItemProps {
  item: CartLineItemType;
}

export function CartLineItem({ item }: CartLineItemProps) {
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  const handleRemove = () => {
    const snapshot = { ...item };
    removeItem(item.itemId, item.sizeId);
    toast('Removed from cart', {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => {
          const { addItem, updateQuantity: updateQty, items } = useCartStore.getState();
          const existing = items.find(
            (i) => i.itemId === snapshot.itemId && i.sizeId === snapshot.sizeId,
          );
          if (existing) {
            updateQty(snapshot.itemId, snapshot.sizeId, snapshot.quantity);
          } else {
            const { quantity: _q, ...lineWithoutQty } = snapshot;
            addItem(lineWithoutQty);
            if (snapshot.quantity > 1) {
              updateQty(snapshot.itemId, snapshot.sizeId, snapshot.quantity - 1);
            }
          }
        },
      },
    });
  };

  const total = lineTotal(item);

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-[1.4] truncate">{item.name}</p>
        {item.modifiers.length > 0 ? (
          <p className="mt-0.5 text-xs leading-[1.4] text-[oklch(0.45_0_0)] truncate">
            {item.modifiers.map((m) => m.name).join(', ')}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 min-w-[44px] min-h-[44px]"
          onClick={() => {
            updateQuantity(item.itemId, item.sizeId, -1);
          }}
          aria-label={`Decrease quantity of ${item.name}`}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <span className="w-6 text-center text-sm tabular-nums">{item.quantity}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 min-w-[44px] min-h-[44px] border-[var(--primary,#16a34a)] text-[var(--primary,#16a34a)] hover:bg-[var(--primary,#16a34a)]/10"
          onClick={() => {
            updateQuantity(item.itemId, item.sizeId, 1);
          }}
          aria-label={`Increase quantity of ${item.name}`}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      <span
        className="w-16 text-right text-sm font-semibold tabular-nums"
        aria-label={`${total} ${item.currency}`}
      >
        {total} {item.currency}
      </span>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 min-w-[44px] min-h-[44px] text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={handleRemove}
        aria-label={`Remove ${item.name} from cart`}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

export { selectSubtotal, selectItemCount };
