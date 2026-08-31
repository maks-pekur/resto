'use client';

import { ShoppingBag } from 'lucide-react';
import { cn } from '../lib/utils';
import { useGuestUi } from './guest-ui-provider';

export interface CartButtonProps {
  readonly itemCount: number;
  readonly onOpen: () => void;
  readonly className?: string;
}

export const CartButton = ({ itemCount, onOpen, className }: CartButtonProps) => {
  const { t } = useGuestUi();

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={itemCount > 0 ? t('cart.itemCount', { n: itemCount }) : t('cart.empty')}
      className={cn(
        'hover:bg-muted focus-visible:ring-ring relative flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none',
        className,
      )}
    >
      <ShoppingBag className="size-5" aria-hidden="true" />
      {itemCount > 0 ? (
        <span
          aria-hidden="true"
          className="bg-primary text-primary-foreground absolute top-0.5 end-0.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] leading-4 font-extrabold tabular-nums"
        >
          {itemCount}
        </span>
      ) : null}
    </button>
  );
};
