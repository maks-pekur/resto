'use client';

import { useCallback, type ReactNode } from 'react';
import { selectSubtotal, useCartStore } from '@resto/cart';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { cn } from '../lib/utils';
import { useDragToDismiss } from './use-drag-to-dismiss';
import { formatPrice } from '../lib/format-price';
import { CartLineRow } from './cart-line-row';
import { useGuestUi } from './guest-ui-provider';

export interface CartSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly currency: string;
  readonly primaryAction?: ReactNode;
  /** From the side on a page, from the bottom edge on a phone — same as the item detail. */
  readonly presentation?: 'drawer' | 'sheet';
}

export const CartSheet = ({
  open,
  onOpenChange,
  currency,
  primaryAction,
  presentation = 'drawer',
}: CartSheetProps) => {
  const { locale, t } = useGuestUi();
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore(selectSubtotal);
  const clearCart = useCartStore((s) => s.clearCart);
  const dismiss = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);
  const drag = useDragToDismiss(open && presentation === 'sheet', dismiss);
  const asSheet = presentation === 'sheet';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={asSheet ? drag.ref : undefined}
        side={asSheet ? 'bottom' : 'right'}
        style={
          asSheet
            ? {
                transform: drag.offset > 0 ? `translateY(${String(drag.offset)}px)` : undefined,
                transition: drag.dragging ? 'none' : undefined,
              }
            : undefined
        }
        className={cn(
          'flex w-full flex-col gap-0 p-0',
          asSheet
            ? 'mx-auto max-h-dvh max-w-lg overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)] outline-none'
            : 'sm:max-w-md',
        )}
      >
        {asSheet ? (
          <span aria-hidden className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
        ) : null}
        <SheetHeader className={cn('px-5 py-4', asSheet ? 'pb-2' : 'border-b')}>
          <SheetTitle className="text-xl font-extrabold">{t('cart.title')}</SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-base font-bold">{t('cart.empty')}</p>
            <p className="text-muted-foreground max-w-xs text-sm">{t('cart.emptyBody')}</p>
          </div>
        ) : (
          <>
            <div className={cn('px-5', asSheet ? '' : 'flex-1 overflow-y-auto')}>
              <ul className="divide-y">
                {items.map((item) => (
                  <li key={`${item.itemId}:${item.sizeId ?? 'base'}`}>
                    <CartLineRow item={item} />
                  </li>
                ))}
              </ul>
            </div>

            <div
              className={cn(
                'flex flex-col gap-3 border-t px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]',
                // The total and the button stay under the thumb while the lines scroll past.
                asSheet && 'bg-background/95 sticky bottom-0 backdrop-blur',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-base font-bold">{t('cart.subtotal')}</span>
                <span className="text-xl font-extrabold tabular-nums">
                  {formatPrice(subtotal, currency, locale)}
                </span>
              </div>

              {primaryAction}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive focus-visible:ring-ring h-10 cursor-pointer rounded-full text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {t('cart.clear')}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('cart.clearHeading')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('cart.clearBody')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('cart.clearCancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => {
                        clearCart();
                      }}
                    >
                      {t('cart.clearConfirm')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
