'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
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
} from '@/components/ui/alert-dialog';
import { CartLineItem } from '@/components/menu/cart-line-item';
import { useCartStore, selectSubtotal } from '@/store/cart';

interface CartDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
}

export function CartDrawer({ open, onOpenChange, currency }: CartDrawerProps) {
  const t = useTranslations('cart');
  const tc = useTranslations('checkout');
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore(selectSubtotal);
  const clearCart = useCartStore((s) => s.clearCart);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[400px]">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="text-[20px] font-semibold leading-[1.2]">Cart</SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <p className="text-[16px] font-semibold leading-[1.5]">{t('empty')}</p>
            <p className="mt-2 max-w-xs text-[14px] leading-[1.4] text-[oklch(0.45_0_0)]">
              {t('emptyBody')}
            </p>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 px-6">
              <ul className="divide-y">
                {items.map((item) => (
                  <li key={`${item.itemId}:${item.sizeId ?? 'base'}`}>
                    <CartLineItem item={item} />
                  </li>
                ))}
              </ul>
            </ScrollArea>

            <div className="border-t px-6 py-4">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  disabled
                  placeholder={tc('promoPlaceholder')}
                  aria-label={tc('promoPlaceholder')}
                  className="h-10 flex-1 rounded-md border bg-transparent px-3 text-[14px] opacity-50"
                />
                <Button type="button" disabled className="opacity-50">
                  {tc('promoApply')}
                </Button>
              </div>
              <p className="mt-1 text-[12px] leading-[1.4] text-[oklch(0.45_0_0)]">
                {tc('promoHelper')}
              </p>
            </div>

            <SheetFooter className="gap-3 border-t px-6 py-4">
              <div className="flex items-center justify-between">
                <span className="text-[16px] font-semibold leading-[1.5]">Subtotal</span>
                <span
                  className="text-[16px] font-semibold tabular-nums"
                  aria-label={`${subtotal} ${currency}`}
                >
                  {subtotal} {currency}
                </span>
              </div>
              <Separator />
              <Button
                asChild
                className="w-full bg-[var(--primary,#16a34a)] text-white hover:bg-[var(--primary,#16a34a)]/90"
              >
                <Link href="/checkout">{t('goToCheckout')}</Link>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-destructive hover:text-destructive"
                  >
                    {t('clearCart')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('clearCartHeading')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('clearCartBody')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('clearCartCancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-white hover:bg-destructive/90"
                      onClick={() => {
                        clearCart();
                      }}
                    >
                      {t('clearCartConfirm')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
