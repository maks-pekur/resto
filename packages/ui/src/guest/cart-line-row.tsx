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

  const details = [item.sizeName, ...item.modifiers.map((modifier) => modifier.name)].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  );

  return (
    <div className="flex items-center gap-2.5 py-3">
      {item.imageUrl ? (
        <span className="bg-muted relative size-12 shrink-0 overflow-hidden rounded-lg">
          <Image src={item.imageUrl} alt="" sizes="48px" className="size-full object-cover" />
        </span>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-sm font-bold">{item.name}</p>
        {/* What the guest actually ordered: the size first, then everything they added to it. */}
        {details.length > 0 ? (
          <p className="text-muted-foreground truncate text-xs">{details.join(' · ')}</p>
        ) : null}
        <p className="text-sm font-bold whitespace-nowrap tabular-nums">
          {formatPrice(lineTotal(item), item.currency, locale)}
        </p>
      </div>

      <div className="bg-muted flex shrink-0 items-center rounded-full p-0.5">
        <button
          type="button"
          onClick={() => {
            updateQuantity(item.itemId, item.sizeId, -1);
          }}
          aria-label={t('item.qtyDecrease', { name: item.name })}
          className="hover:bg-background focus-visible:ring-ring flex size-8 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <Minus className="size-3.5" aria-hidden="true" />
        </button>
        <span className="w-5 text-center text-sm font-bold tabular-nums">{item.quantity}</span>
        <button
          type="button"
          onClick={() => {
            updateQuantity(item.itemId, item.sizeId, 1);
          }}
          aria-label={t('item.qtyIncrease', { name: item.name })}
          className="hover:bg-background focus-visible:ring-ring flex size-8 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => {
          removeItem(item.itemId, item.sizeId);
        }}
        aria-label={t('item.remove', { name: item.name })}
        className="text-muted-foreground hover:text-destructive focus-visible:ring-ring -mr-1 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
};
