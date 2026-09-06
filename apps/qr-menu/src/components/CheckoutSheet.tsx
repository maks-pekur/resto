import { useState } from 'react';
import { selectSubtotal, useCartStore } from '@resto/cart';
import { Sheet, SheetContent, SheetHeader, SheetTitle, formatPrice } from '@resto/ui';
import { placeOrder, OrderRequestError, type PlacedOrder } from '../api/client';
export type PaymentChoice = 'online' | 'cash';
import { getActiveLocale, t } from '../i18n';

export interface CheckoutSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly currency: string;
  readonly onPlaced: (order: PlacedOrder, payment: PaymentChoice) => void;
}

const newIdempotencyKey = (): string => crypto.randomUUID();

export const CheckoutSheet = ({ open, onOpenChange, currency, onPlaced }: CheckoutSheetProps) => {
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore(selectSubtotal);
  const clearCart = useCartStore((s) => s.clearCart);

  const [payment, setPayment] = useState<PaymentChoice>('online');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locale = getActiveLocale();

  const submit = async (): Promise<void> => {
    if (items.length === 0) return;
    setPending(true);
    setError(null);
    try {
      const order = await placeOrder({
        paymentType: payment,
        idempotencyKey: newIdempotencyKey(),
        ...(name.trim().length > 0 ? { customerName: name.trim() } : {}),
        items: items.map((line) => ({
          itemId: line.itemId,
          sizeId: line.sizeId,
          name: line.name,
          quantity: line.quantity,
          modifiers: line.modifiers.map((modifier) => ({
            optionId: modifier.optionId,
            name: modifier.name,
            ...(modifier.amount === undefined ? {} : { amount: modifier.amount }),
          })),
        })),
      });
      clearCart();
      onOpenChange(false);
      onPlaced(order, payment);
    } catch (cause) {
      setError(cause instanceof OrderRequestError ? cause.code : 'unknown');
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        onOpenAutoFocus={(event) => {
          // iOS answers a focused text field with the keyboard and its AutoFill bar, both on top
          // of a sheet the guest has not touched yet. The panel takes the focus instead.
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
        className="mx-auto max-h-dvh w-full max-w-lg gap-0 overflow-y-auto rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)] outline-none"
      >
        <span aria-hidden className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
        <SheetHeader className="px-5 pt-4 pb-2">
          <SheetTitle>{t('checkout.title')}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-5 pb-6">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">{t('checkout.nameLabel')}</span>
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              maxLength={200}
              placeholder={t('checkout.namePlaceholder')}
              className="border-input focus-visible:ring-ring h-11 rounded-xl border px-3 text-base focus-visible:ring-2 focus-visible:outline-none"
            />
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="pb-2 text-sm font-bold">{t('checkout.paymentLabel')}</legend>
            {(['online', 'cash'] as const).map((choice) => (
              <label
                key={choice}
                className="has-[:checked]:border-primary has-[:checked]:bg-primary-tint flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors"
              >
                <input
                  type="radio"
                  name="payment"
                  className="accent-primary size-4"
                  checked={payment === choice}
                  onChange={() => {
                    setPayment(choice);
                  }}
                />
                <span className="flex flex-col">
                  {t(`checkout.payment.${choice}`)}
                  <span className="text-muted-foreground text-xs font-normal">
                    {t(`checkout.paymentHint.${choice}`)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          {error === null ? null : (
            <p className="text-destructive text-sm">{t('checkout.failed')}</p>
          )}

          <button
            type="button"
            disabled={pending || items.length === 0}
            onClick={() => {
              void submit();
            }}
            className="bg-primary text-primary-foreground focus-visible:ring-ring flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full px-5 text-base font-bold transition-transform active:scale-[0.99] focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>{pending ? t('checkout.placing') : t('checkout.place')}</span>
            <span className="tabular-nums">{formatPrice(subtotal, currency, locale)}</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
