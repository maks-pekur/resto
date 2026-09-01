import { useEffect, useRef, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, formatPrice } from '@resto/ui';
import { fetchOrderStatus, type OrderStatus, type PlacedOrder } from '../api/client';
import { getActiveLocale, t } from '../i18n';
import { PayNow } from './PayNow';
import type { PaymentChoice } from './CheckoutSheet';

const POLL_MS = 5_000;

export interface OrderStatusSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly order: PlacedOrder;
  readonly payment: PaymentChoice;
}

const STAGE_KEY: Readonly<Record<OrderStatus['status'], string>> = {
  placed: 'order.stagePlaced',
  accepted: 'order.stageAccepted',
  preparing: 'order.stagePreparing',
  ready: 'order.stageReady',
  completed: 'order.stageCompleted',
  canceled: 'order.stageCanceled',
};

/**
 * What happens after the guest presses the button: staff confirm the order first, and only then
 * is there anything to pay — the guest sits at the table while both play out.
 */
export const OrderStatusSheet = ({ open, onOpenChange, order, payment }: OrderStatusSheetProps) => {
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const locale = getActiveLocale();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const controller = new AbortController();

    const poll = (): void => {
      fetchOrderStatus(order.orderId, controller.signal)
        .then((next) => {
          if (cancelled) return;
          setStatus(next);
          // Nothing moves on its own once the order is finished and the money settled.
          const settled =
            (next.status === 'completed' || next.status === 'canceled') &&
            next.paymentStatus !== 'pending' &&
            next.paymentStatus !== 'requires_action';
          if (!settled) timer.current = setTimeout(poll, POLL_MS);
        })
        .catch(() => {
          if (!cancelled) timer.current = setTimeout(poll, POLL_MS);
        });
    };

    poll();
    return () => {
      cancelled = true;
      controller.abort();
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [open, order.orderId]);

  const confirmed = status !== null && status.status !== 'placed' && status.status !== 'canceled';
  const owes = status !== null && status.paymentStatus !== 'paid' && status.status !== 'canceled';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-dvh w-full max-w-lg gap-0 overflow-y-auto rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]"
      >
        <span aria-hidden className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
        <SheetHeader className="px-5 pt-4 pb-2">
          <SheetTitle>
            {t('order.number', { n: status?.shortNumber ?? order.orderNumber })}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-5 pb-6">
          <div className="flex flex-col gap-1">
            <p className="text-lg font-extrabold">{t(STAGE_KEY[status?.status ?? 'placed'])}</p>
            <p className="text-muted-foreground text-sm">
              {confirmed ? t('order.confirmedBody') : t('order.waitingBody')}
            </p>
          </div>

          <div className="flex items-center justify-between border-t pt-4 text-sm">
            <span className="text-muted-foreground">{t('order.total')}</span>
            <span className="font-extrabold tabular-nums">
              {formatPrice(
                status?.total ?? order.total,
                status?.currency ?? order.currency,
                locale,
              )}
            </span>
          </div>

          {owes && payment === 'cash' ? (
            <p className="bg-muted rounded-xl px-4 py-3 text-sm">{t('order.payAtTable')}</p>
          ) : null}

          {/* Card payment opens only once staff have taken the order on. */}
          {owes && payment === 'online' && confirmed ? <PayNow orderId={order.orderId} /> : null}

          {owes && payment === 'online' && !confirmed ? (
            <p className="text-muted-foreground text-sm">{t('order.payAfterConfirm')}</p>
          ) : null}

          {status?.paymentStatus === 'paid' ? (
            <p className="text-success text-sm font-semibold">{t('order.paid')}</p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
};
