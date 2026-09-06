'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { CheckIcon } from 'lucide-react';
import { Button } from '@resto/ui';
import { cn } from '@resto/ui';
import { getOrderStatus, type OrderStatusResponse } from '@/lib/checkout-api';

type TrackerStatus = 'placed' | 'accepted' | 'preparing' | 'ready';
const TRACKER_ORDER: readonly TrackerStatus[] = ['placed', 'accepted', 'preparing', 'ready'];

type KnownStatus = TrackerStatus | 'completed' | 'canceled';

const TERMINAL_STATUSES = new Set<KnownStatus>(['completed', 'canceled']);

function pollIntervalMs(status: string): number {
  switch (status) {
    case 'placed':
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
      // A payment that failed or was returned goes nowhere on its own either.
      if (status.paymentStatus === 'failed' || status.paymentStatus === 'refunded') return;
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
    <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
      <span>{t('status.updateFailed')}</span>
      <Button type="button" variant="outline" size="sm" onClick={handleRetry}>
        {t('status.retry')}
      </Button>
    </div>
  ) : isPolling ? (
    <p className="text-xs text-muted-foreground">{t('status.updating')}</p>
  ) : null;

  if (status.paymentStatus === 'failed') {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">{t('status.paymentFailedTitle')}</h1>
        <Button asChild className="w-full bg-primary text-primary-foreground">
          <Link href="/checkout">{t('status.paymentFailedRetry')}</Link>
        </Button>
      </div>
    );
  }

  if (status.status === 'canceled' || status.paymentStatus === 'refunded') {
    // Refused before the kitchen took it on reads as declined; stopped later reads as canceled.
    const title =
      status.canceledFromStatus === 'placed'
        ? t('status.declinedTitle')
        : t('status.canceledTitle');
    const reasonKey = reasonMessageKey(status.cancelReason);
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {reasonKey ? (
          <p className="text-sm text-muted-foreground">{capitalize(t(reasonKey))}.</p>
        ) : null}
        <p className="text-sm">
          {t('status.refundLine', { amount: `${status.currency} ${status.total}` })}
        </p>
        <Button asChild className="w-full bg-primary text-primary-foreground">
          <Link href="/">{t('status.backToMenu')}</Link>
        </Button>
      </div>
    );
  }

  // Money still in flight: the guest is looking at a payment, not at a kitchen.
  if (status.paymentStatus === 'pending' || status.paymentStatus === 'requires_action') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-base text-muted-foreground">{t('status.awaitingPayment')}</p>
        {reconnectBanner}
      </div>
    );
  }

  const currentIndex =
    status.status === 'completed'
      ? TRACKER_ORDER.length
      : TRACKER_ORDER.indexOf(status.status as TrackerStatus);

  const readyLabel =
    status.orderType === 'dine_in' ? t('status.stepReadyDineIn') : t('status.stepReadyPickup');

  const steps: { key: TrackerStatus; label: string }[] = [
    { key: 'placed', label: t('status.stepPaid') },
    { key: 'accepted', label: t('status.stepAccepted') },
    { key: 'preparing', label: t('status.stepPreparing') },
    { key: 'ready', label: readyLabel },
  ];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-3xl font-semibold">
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
                  <span className="text-xs font-semibold">{index + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  'text-xs font-normal uppercase text-muted-foreground sm:text-center',
                  (state === 'current' || state === 'complete') &&
                    'text-sm font-semibold text-foreground normal-case',
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-sm">
        {status.etaAt
          ? t('status.etaLabel', { time: formatClockTime(status.etaAt, locale) })
          : t('status.waitingAccept')}
      </p>

      {reconnectBanner}
    </div>
  );
}
