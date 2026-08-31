'use client';

import { Minus, Plus, X } from 'lucide-react';
import { formatMinorUnits, parseMinorUnits, useCartStore, type CartLineItem } from '@resto/cart';
import { formatPrice } from '../lib/format-price';
import { useGuestUi } from './guest-ui-provider';

const lineTotal = (item: CartLineItem): string => {
  let minor = parseMinorUnits(item.unitPrice);
  for (const modifier of item.modifiers) {
    minor += parseMinorUnits(modifier.priceDelta);
  }
  return formatMinorUnits(minor * item.quantity);
};

export interface CartLineRowProps {
  readonly item: CartLineItem;
}

export const CartLineRow = ({ item }: CartLineRowProps) => {
  const { locale, t, Image } = useGuestUi();
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  return (
    <div className="flex items-center gap-3 py-4">
      {item.imageUrl ? (
        <span className="bg-muted relative size-14 shrink-0 overflow-hidden rounded-lg">
          <Image src={item.imageUrl} alt="" sizes="56px" className="size-full object-cover" />
        </span>
      ) : null}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{item.name}</p>
        {item.modifiers.length > 0 ? (
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {item.modifiers.map((m) => m.name).join(', ')}
          </p>
        ) : null}
        <p className="mt-1 text-sm font-bold tabular-nums">
          {formatPrice(lineTotal(item), item.currency, locale)}
        </p>
      </div>

      <div className="bg-muted flex items-center gap-1 rounded-full p-1">
        <button
          type="button"
          onClick={() => {
            updateQuantity(item.itemId, item.sizeId, -1);
          }}
          aria-label={t('item.qtyDecrease', { name: item.name })}
          className="hover:bg-background focus-visible:ring-ring flex size-11 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none sm:size-9"
        >
          <Minus className="size-4" aria-hidden="true" />
        </button>
        <span className="w-6 text-center text-sm font-bold tabular-nums">{item.quantity}</span>
        <button
          type="button"
          onClick={() => {
            updateQuantity(item.itemId, item.sizeId, 1);
          }}
          aria-label={t('item.qtyIncrease', { name: item.name })}
          className="hover:bg-background focus-visible:ring-ring flex size-11 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none sm:size-9"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => {
          removeItem(item.itemId, item.sizeId);
        }}
        aria-label={t('item.remove', { name: item.name })}
        className="text-muted-foreground hover:text-destructive focus-visible:ring-ring flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none sm:size-9"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
};
