'use client';

import { ShoppingBag } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';
import { useGuestUi } from './guest-ui-provider';

export interface GuestHeaderProps {
  readonly tenantName: string;
  readonly logoUrl?: string | null;
  readonly cartItemCount?: number;
  readonly cartTotal?: string | null;
  readonly onOpenCart?: () => void;
  readonly actions?: ReactNode;
}

export const GuestHeader = ({
  tenantName,
  logoUrl,
  cartItemCount = 0,
  cartTotal,
  onOpenCart,
  actions,
}: GuestHeaderProps) => {
  const { t, Image } = useGuestUi();

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-50 h-(--header-height) w-full border-b backdrop-blur">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <a href="/" className="flex min-w-0 items-center gap-2.5 focus-visible:outline-none">
          {logoUrl ? (
            <span className="relative size-9 shrink-0 overflow-hidden rounded-xl">
              <Image
                src={logoUrl}
                alt={tenantName}
                sizes="36px"
                priority
                className="size-full object-cover"
              />
            </span>
          ) : null}
          <span className="truncate text-lg leading-tight font-extrabold sm:text-xl">
            {tenantName}
          </span>
        </a>

        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {onOpenCart ? (
            <button
              type="button"
              onClick={onOpenCart}
              aria-label={
                cartItemCount > 0 ? t('cart.itemCount', { n: cartItemCount }) : t('cart.empty')
              }
              className={cn(
                'focus-visible:ring-ring inline-flex h-10 cursor-pointer items-center gap-2 rounded-full px-3.5 text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:h-11 sm:px-4',
                cartItemCount > 0
                  ? 'bg-primary text-primary-foreground hover:brightness-95'
                  : 'bg-muted text-foreground hover:bg-secondary',
              )}
            >
              <ShoppingBag className="size-5" aria-hidden="true" />
              {cartItemCount > 0 ? (
                <span className="tabular-nums">{cartTotal ?? cartItemCount}</span>
              ) : (
                <span className="sr-only sm:not-sr-only">{t('cart.open')}</span>
              )}
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
};
