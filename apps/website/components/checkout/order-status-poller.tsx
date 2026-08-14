'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { CheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getOrderStatus, type OrderStatusResponse } from '@/lib/checkout-api';

// The four tracker steps this app can actually back -- Phase 9 (delivery
// zones/fulfillment tracking) does not exist yet, so there is deliberately
// no fifth step for a delivery order's transit leg here (Skeptic HIGH-6).
// A `delivery` order reuses the pickup-ready label.
type TrackerStatus = 'paid' | 'accepted' | 'preparing' | 'ready';
const TRACKER_ORDER: readonly TrackerStatus[] = ['paid', 'accepted', 'preparing', 'ready'];

type KnownStatus =
  | TrackerStatus
  | 'created'
  | 'requires_action'
  | 'completed'
  | 'canceled'
  | 'refunded'
  | 'failed';

// D-16: 'paid' MUST NOT be terminal. The pre-existing bug stopped polling the
// moment Stripe settled, so accepted/preparing/ready never rendered -- the
// entire guest half of this phase was invisible. 'refunded' is kept only as
// a defensive fallback: refund() never writes order.status (see
// order.aggregate.ts), so this value is not produced by the current backend.
const TERMINAL_STATUSES = new Set<KnownStatus>(['completed', 'canceled', 'refunded', 'failed']);

function pollIntervalMs(status: string): number {
  switch (status) {
    case 'created':
    case 'requires_action':
      return 2_000;
    case 'paid':
      return 5_000;
    case 'accepted':
    case 'preparing':
      return 15_000;
    case 'ready':
    default:
      return 30_000;
  }
}

const CANCEL_REASON_KEYS: Record<string, string> = {
  kitchen_out_of_stock: 'status.reasons.kitchenOutOfStock',
  kitchen_too_busy: 'status.reasons.kitchenTooBusy',
  guest_requested: 'status.reasons.guestRequested',
  guest_no_show: 'status.reasons.guestNoShow',
  payment_issue: 'status.reasons.paymentIssue',
  duplicate_order: 'status.reasons.duplicateOrder',
  other: 'status.reasons.other',
};

function reasonMessageKey(code: string | null): string | null {
  if (code === null) return null;
  return CANCEL_REASON_KEYS[code] ?? 'status.reasons.other';
}

function capitalize(text: string): string {
  const first = text.slice(0, 1);
  return first.length === 0 ? text : first.toUpperCase() + text.slice(1);
}

const CLOCK_LOCALES: Record<string, string> = { ru: 'ru-RU', uk: 'uk-UA', en: 'en-US' };

function formatClockTime(iso: string, locale: string): string {
  const tag = CLOCK_LOCALES[locale] ?? 'en-US';
  return new Date(iso).toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' });
}

interface Props {
  orderId: string;
  initialStatus: OrderStatusResponse;
}

export function OrderStatusPoller({ orderId, initialStatus }: Props) {
  const t = useTranslations('checkout');
  const locale = useLocale();
  const [status, setStatus] = useState<OrderStatusResponse>(initialStatus);
  const [isPolling, setIsPolling] = useState(false);
  const [pollFailed, setPollFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let cancelled = false;

    const runPoll = (currentStatus: string) => {
      getOrderStatus(orderId)
        .then((next) => {
          if (cancelled) return;
          setStatus(next);
          setIsPolling(false);
          setPollFailed(false);
          scheduleNext(next.status);
        })
        .catch(() => {
          if (cancelled) return;
          setIsPolling(false);
          setPollFailed(true);
          scheduleNext(currentStatus);
        });
    };

    const scheduleNext = (currentStatus: string) => {
      if (TERMINAL_STATUSES.has(currentStatus as KnownStatus)) return;
      timerRef.current = setTimeout(() => {
        if (cancelled) return;
        setIsPolling(true);
        runPoll(currentStatus);
      }, pollIntervalMs(currentStatus));
    };

    retryRef.current = () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      setIsPolling(true);
      runPoll(status.status);
    };

    scheduleNext(initialStatus.status);

    return () => {
      cancelled = true;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [orderId, initialStatus.status]);

  const handleRetry = () => {
    retryRef.current();
  };

  const reconnectBanner = pollFailed ? (
    <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-[12px] leading-[1.4] text-destructive">
      <span>{t('status.updateFailed')}</span>
      <Button type="button" variant="outline" size="sm" onClick={handleRetry}>
        {t('status.retry')}
      </Button>
    </div>
  ) : isPolling ? (
    <p className="text-[12px] leading-[1.4] text-muted-foreground">{t('status.updating')}</p>
  ) : null;

  // 'failed': payment never confirmed -- markFailed() only fires from
  // created/paid, before any operator ever sees the order. This is not a
  // restaurant decision, so it must never share copy with the
  // declined/canceled card below (D-09's asymmetry extends to payment
  // failures too -- don't blame the kitchen for a card decline).
  if (status.status === 'failed') {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-[24px] font-semibold leading-[1.2]">
          {t('status.paymentFailedTitle')}
        </h1>
        <Button asChild className="w-full bg-(--primary,#16a34a) text-white">
          <Link href="/checkout">{t('status.paymentFailedRetry')}</Link>
        </Button>
      </div>
    );
  }

  if (status.status === 'canceled' || status.status === 'refunded') {
    const title =
      status.canceledFromStatus === 'paid' ? t('status.declinedTitle') : t('status.canceledTitle');
    const reasonKey = reasonMessageKey(status.cancelReason);
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-[24px] font-semibold leading-[1.2]">{title}</h1>
        {reasonKey ? (
          <p className="text-[14px] leading-[1.5] text-muted-foreground">
            {capitalize(t(reasonKey))}.
          </p>
        ) : null}
        <p className="text-[14px] leading-[1.5]">
          {t('status.refundLine', { amount: `${status.currency} ${status.total}` })}
        </p>
        <Button asChild className="w-full bg-(--primary,#16a34a) text-white">
          <Link href="/">{t('status.backToMenu')}</Link>
        </Button>
      </div>
    );
  }

  if (status.status === 'created' || status.status === 'requires_action') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[16px] leading-[1.5] text-muted-foreground">
          {t('status.awaitingPayment')}
        </p>
        {reconnectBanner}
      </div>
    );
  }

  const currentIndex =
    status.status === 'completed'
      ? TRACKER_ORDER.length
      : TRACKER_ORDER.indexOf(status.status as TrackerStatus);

  const readyLabel =
    status.fulfillmentMode === 'dine_in'
      ? t('status.stepReadyDineIn')
      : t('status.stepReadyPickup');

  const steps: { key: TrackerStatus; label: string }[] = [
    { key: 'paid', label: t('status.stepPaid') },
    { key: 'accepted', label: t('status.stepAccepted') },
    { key: 'preparing', label: t('status.stepPreparing') },
    { key: 'ready', label: readyLabel },
  ];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-[28px] font-semibold leading-[1.1]">
        {t('status.orderNumberLabel', { n: status.shortNumber ?? '—' })}
      </p>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-2">
        {steps.map((step, index) => {
          const state =
            index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'future';
          return (
            <div
              key={step.key}
              className="flex flex-1 items-center gap-3 sm:flex-col sm:items-center"
            >
              <div
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2',
                  state === 'complete' && 'border-success bg-success text-success-foreground',
                  state === 'current' && 'border-primary bg-primary text-primary-foreground',
                  state === 'future' && 'border-muted-foreground/30 text-muted-foreground',
                )}
              >
                {state === 'complete' ? (
                  <CheckIcon className="size-4" />
                ) : (
                  <span className="text-[12px] font-semibold">{index + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  'text-[12px] leading-[1.2] font-normal uppercase text-muted-foreground sm:text-center',
                  (state === 'current' || state === 'complete') &&
                    'text-[14px] font-semibold text-foreground normal-case',
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[14px] leading-[1.5]">
        {status.etaAt
          ? t('status.etaLabel', { time: formatClockTime(status.etaAt, locale) })
          : t('status.waitingAccept')}
      </p>

      {reconnectBanner}
    </div>
  );
}
