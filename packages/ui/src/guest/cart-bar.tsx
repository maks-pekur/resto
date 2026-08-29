'use client';

import { ShoppingBag } from 'lucide-react';
import { useGuestUi } from './guest-ui-provider';

export interface CartBarProps {
  readonly itemCount: number;
  readonly total: string;
  readonly onOpen: () => void;
}

export const CartBar = ({ itemCount, total, onOpen }: CartBarProps) => {
  const { t } = useGuestUi();

  if (itemCount === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
      <button
        type="button"
        onClick={onOpen}
        className="bg-primary text-primary-foreground focus-visible:ring-ring pointer-events-auto flex h-14 w-full cursor-pointer items-center justify-between gap-3 rounded-full px-5 text-base font-bold shadow-lg transition-transform active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <span className="flex items-center gap-2">
          <ShoppingBag className="size-5" aria-hidden="true" />
          {t('cart.itemCount', { n: itemCount })}
        </span>
        <span className="tabular-nums">{total}</span>
      </button>
    </div>
  );
};
