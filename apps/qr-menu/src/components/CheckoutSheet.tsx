import { lazy, Suspense, useState } from 'react';
import { selectSubtotal, useCartStore } from '@resto/cart';
import { Sheet, SheetContent, SheetHeader, SheetTitle, formatPrice } from '@resto/ui';
import { openTableSession, placeOrder, OrderRequestError, type PlacedOrder } from '../api/client';
import { canScanInPage } from './TableScanner';
import { getActiveLocale, t } from '../i18n';

const Scanner = lazy(async () => ({ default: (await import('./TableScanner')).TableScanner }));

export type PaymentChoice = 'online' | 'cash';

/** Our codes carry the secret as `/t/<token>` — nothing else in them is worth reading. */
export const qrTokenFromScan = (raw: string): string | null => {
  try {
    const url = new URL(raw, window.location.origin);
    if (url.host !== window.location.host) return null;
    return /^\/t\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
};

export interface CheckoutSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly currency: string;
  readonly tableId: string | undefined;
  /** A table read off a code mid-checkout: the guest never leaves this sheet. */
  readonly onTableScanned: (tableId: string) => void;
  readonly onPlaced: (order: PlacedOrder, payment: PaymentChoice) => void;
}

const newIdempotencyKey = (): string => crypto.randomUUID();

export const CheckoutSheet = ({
  open,
  onOpenChange,
  currency,
  tableId,
  onTableScanned,
  onPlaced,
}: CheckoutSheetProps) => {
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore(selectSubtotal);
  const zoneName = useCartStore((s) => s.tableZoneName);
  const tableNumber = useCartStore((s) => s.tableNumber);
  const clearCart = useCartStore((s) => s.clearCart);

  const [payment, setPayment] = useState<PaymentChoice>('online');
  const [scanning, setScanning] = useState(false);
  const [scanFailed, setScanFailed] = useState(false);
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locale = getActiveLocale();

  const submit = async (): Promise<void> => {
    if (tableId === undefined || items.length === 0) return;
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

  const table = zoneName !== null && tableNumber !== null ? `${zoneName} · ${tableNumber}` : null;

  const applyScan = (raw: string): void => {
    const scanned = qrTokenFromScan(raw);
    if (scanned === null) {
      setScanFailed(true);
      return;
    }
    // The secret is exchanged for a session, exactly as a fresh scan would: a code from another
    // restaurant simply does not resolve.
    openTableSession(scanned)
      .then((resolved) => {
        useCartStore.getState().setTable(resolved);
        setScanning(false);
        setScanFailed(false);
        onTableScanned(resolved.tableId);
      })
      .catch(() => {
        setScanFailed(true);
      });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] w-full max-w-lg gap-0 overflow-y-auto rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]"
      >
        <span aria-hidden className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
        <SheetHeader className="px-5 pt-4 pb-2">
          <SheetTitle>{t('checkout.title')}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-5 pb-6">
          {table === null ? null : (
            <p className="text-muted-foreground text-sm">{t('checkout.table', { table })}</p>
          )}

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

          {tableId === undefined ? (
            // The order is not refused, only paused: the cart stays exactly as it is while the
            // guest points their phone at the code on the table.
            <div className="border-primary/40 bg-primary-tint/40 flex flex-col gap-3 rounded-2xl border p-4">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-extrabold">{t('table.needScanTitle')}</p>
                <p className="text-muted-foreground text-sm">{t('table.needScanBody')}</p>
              </div>

              {scanning ? (
                <Suspense
                  fallback={
                    <p className="text-muted-foreground text-sm">{t('table.scanStarting')}</p>
                  }
                >
                  <Scanner
                    onDecoded={applyScan}
                    onUnavailable={() => {
                      setScanning(false);
                      setScanFailed(true);
                    }}
                  />
                </Suspense>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setScanFailed(false);
                    setScanning(true);
                  }}
                  disabled={!canScanInPage()}
                  className="bg-primary text-primary-foreground flex h-11 w-full cursor-pointer items-center justify-center rounded-full px-5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('table.scanAction')}
                </button>
              )}

              <p className="text-muted-foreground text-xs">
                {canScanInPage() ? t('table.scanCartKept') : t('table.scanWithCamera')}
              </p>
              {scanFailed ? (
                <p className="text-destructive text-xs">{t('table.scanFailed')}</p>
              ) : null}
            </div>
          ) : (
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
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
