'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getOrderStatus, type OrderStatusResponse } from '@/lib/checkout-api';

const POLL_INTERVALS_MS = [1_000, 2_000, 3_000, 5_000, 10_000];
const MAX_INTERVAL_MS = 10_000;
const TERMINAL_STATUSES = new Set(['paid', 'failed', 'canceled', 'refunded']);

interface Props {
  orderId: string;
  initialStatus: OrderStatusResponse;
}

export function OrderStatusPoller({ orderId, initialStatus }: Props) {
  const [status, setStatus] = useState<OrderStatusResponse>(initialStatus);
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (TERMINAL_STATUSES.has(initialStatus.status)) return;

    const poll = () => {
      const interval =
        POLL_INTERVALS_MS[Math.min(attemptRef.current, POLL_INTERVALS_MS.length - 1)] ??
        MAX_INTERVAL_MS;

      timerRef.current = setTimeout(() => {
        getOrderStatus(orderId)
          .then((next) => {
            setStatus(next);
            attemptRef.current += 1;
            if (!TERMINAL_STATUSES.has(next.status)) {
              poll();
            }
          })
          .catch(() => {
            attemptRef.current += 1;
            poll();
          });
      }, interval);
    };

    poll();

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [orderId, initialStatus.status]);

  const isPaid = status.status === 'paid';
  const isFailed = status.status === 'failed' || status.status === 'canceled';
  const isPending = !isPaid && !isFailed;

  if (isFailed) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[16px] leading-[1.5] text-red-600">
          Payment could not be completed. Order #{status.orderNumber}
        </p>
        <Button asChild className="w-full bg-(--primary,#16a34a) text-white">
          <Link href="/checkout">Try again</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {isPending ? (
        <p className="text-[16px] leading-[1.5] text-[oklch(0.45_0_0)]">Confirming payment…</p>
      ) : (
        <p className="text-[16px] leading-[1.5] font-medium text-green-700">Payment confirmed</p>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[14px] leading-[1.5]">
        <dt className="text-[oklch(0.45_0_0)]">Order</dt>
        <dd className="font-mono">#{status.orderNumber}</dd>
        <dt className="text-[oklch(0.45_0_0)]">Total</dt>
        <dd>
          {status.currency} {status.total}
        </dd>
        {status.eta ? (
          <>
            <dt className="text-[oklch(0.45_0_0)]">ETA</dt>
            <dd>{new Date(status.eta).toLocaleTimeString()}</dd>
          </>
        ) : null}
        <dt className="text-[oklch(0.45_0_0)]">Status</dt>
        <dd className="capitalize">{status.status.replace('_', ' ')}</dd>
      </dl>
    </div>
  );
}
