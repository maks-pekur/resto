import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, MapPin, ShoppingBag, Truck, UtensilsCrossed } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMoney } from '@/hooks/use-money';
import { countdown } from '@/lib/orders/remaining';
import { channelPresentation } from '@/lib/orders/channels';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { usePermissions } from '@/hooks/use-permissions';
import { advanceOrderStatusMutation, retryRefundMutation } from '@/lib/queries/orders';
import type { OrderFeedRowApi } from '@/lib/queries/orders';
import { CountdownRing } from '@/components/common/countdown-ring';
import { OrderRefundFailedBadge, type OrderCardState } from './order-status-badge';
import { AcceptPopover } from './accept-popover';
import { RejectPopover } from './reject-popover';

export const UNACCEPTED_ESCALATION_MS = 5 * 60_000;

export type OrderRowStateSource = Pick<OrderFeedRowApi, 'status' | 'acceptedAt' | 'createdAt'>;

export function deriveOrderRowState(row: OrderRowStateSource, now: number): OrderCardState {
  if (row.status === 'paid' && row.acceptedAt === null) {
    const age = now - new Date(row.createdAt).getTime();
    return age >= UNACCEPTED_ESCALATION_MS ? 'escalated' : 'new';
  }
  if (row.status === 'accepted') return 'accepted';
  if (row.status === 'preparing') return 'preparing';
  if (row.status === 'ready') return 'ready';
  if (row.status === 'canceled' || row.status === 'refunded' || row.status === 'failed') {
    return 'canceled';
  }
  return 'completed';
}

export const AGE_BAND_CLASS = (ageMs: number): string => {
  if (ageMs < 5 * 60_000) return 'text-success';
  if (ageMs < 15 * 60_000) return 'text-warning';
  return 'text-destructive';
};

const ORDER_TYPE_ICON: Record<
  OrderFeedRowApi['orderType'],
  React.ComponentType<{ className?: string }>
> = {
  dine_in: UtensilsCrossed,
  pickup: ShoppingBag,
  delivery: Truck,
};

export const ORDER_TYPE_LABEL_KEY: Record<OrderFeedRowApi['orderType'], string> = {
  dine_in: 'orderTypeDineIn',
  pickup: 'orderTypePickup',
  delivery: 'orderTypeDelivery',
};

// The order carries how the guest pays; a refund or a failed charge overrides it, because the
// money is what the operator needs to see there, not the intention.
const paymentKeyOf = (row: OrderFeedRowApi): string => {
  if (row.status === 'refunded') return 'refunded';
  if (row.status === 'created' || row.status === 'requires_action' || row.status === 'failed') {
    return 'unpaid';
  }
  return row.paymentType;
};

export interface OrderRowProps {
  readonly row: OrderFeedRowApi;
  readonly showLocationBadge: boolean;
  readonly onOpenDetail: (row: OrderFeedRowApi) => void;
}

export function OrderRow({ row, showLocationBadge, onOpenDetail }: OrderRowProps) {
  const { t, i18n } = useTranslation('translation', { keyPrefix: 'orders' });
  const money = useMoney();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const now = Date.now();
  const state = deriveOrderRowState(row, now);
  const remaining = countdown(row.etaAt, row.acceptedAt ?? row.createdAt, now);
  const isOpen = state !== 'completed' && state !== 'canceled';

  const advanceMutation = useMutation({
    mutationFn: (targetStatus: 'preparing' | 'ready' | 'completed') =>
      advanceOrderStatusMutation({
        orderId: row.id,
        locationId: row.locationId,
        targetStatus,
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        showError(null, t('card.statusUpdateFailed'));
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: () => {
      showError(null, t('card.statusUpdateFailed'));
    },
  });

  const retryMutation = useMutation({
    mutationFn: () => retryRefundMutation({ orderId: row.id, locationId: row.locationId }),
    onSuccess: (res) => {
      if (!res.ok || !res.data) {
        showError(null, t('refund.failedToast'));
        return;
      }
      showSuccess(
        t('refund.successToast', { amount: money(res.data.amountMinor / 100, row.currency) }),
      );
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: () => {
      showError(null, t('refund.failedToast'));
    },
  });

  // Minutes read fine up to an hour; past that a bare "180" tells an operator nothing, and past
  // three days the exact figure stops being information at all.
  const countdownParts = ((): { label: string; sublabel?: string } => {
    if (remaining === null) return { label: '' };
    if (remaining.overflow) return { label: remaining.late ? '!' : '∞' };
    const sign = remaining.late ? '−' : '';
    if (remaining.days > 0) {
      return {
        label: `${sign}${String(remaining.days)}${t('card.unitDays')}`,
        sublabel: `${String(remaining.hours)}${t('card.unitHours')}`,
      };
    }
    if (remaining.hours > 0) {
      return {
        label: `${sign}${String(remaining.hours)}${t('card.unitHours')}`,
        sublabel: `${String(remaining.minutes).padStart(2, '0')}${t('card.unitMinutes')}`,
      };
    }
    return { label: `${sign}${String(remaining.minutes)}${t('card.unitMinutes')}` };
  })();

  const channel = channelPresentation(row.channel);
  const ChannelIcon = channel.icon;
  const OrderTypeIcon = ORDER_TYPE_ICON[row.orderType];
  const promisedAt = new Date(row.etaAt ?? row.createdAt);
  const dayWord = ((): string => {
    const startOfDay = (d: Date): number => new Date(d).setHours(0, 0, 0, 0);
    const days = Math.round((startOfDay(promisedAt) - startOfDay(new Date())) / 86_400_000);
    if (days === 0) return t('dateNav.today');
    if (days === 1) return t('dateNav.tomorrow');
    if (days === -1) return t('dateNav.yesterday');
    return new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(
      promisedAt,
    );
  })();

  const tableLabel =
    row.tableZoneName !== null && row.tableNumber !== null
      ? t('card.tableLabel', { zone: row.tableZoneName, number: row.tableNumber })
      : row.tableIdentifier;
  const paymentKey = paymentKeyOf(row);

  return (
    <div
      data-testid={`order-row-${row.id}`}
      className={cn(
        'flex min-h-14 items-stretch overflow-hidden rounded-md border transition-colors',
        // A refund that failed is unfinished business: the row must not read as closed and done.
        row.hasFailedRefund ? 'bg-destructive/5' : 'hover:bg-muted/40',
      )}
    >
      <button
        type="button"
        aria-label={t('card.dailyNumber', { n: row.shortNumber })}
        className="flex min-w-0 flex-1 items-stretch divide-x text-left"
        onClick={() => {
          onOpenDetail(row);
        }}
      >
        {/* Square by construction: the width matches the row height, so the source reads as a
            stamp on the order rather than as another column of text. */}
        <span
          className={cn(
            'flex w-20 shrink-0 items-center justify-center gap-1.5 px-2',
            channel.tone,
          )}
          style={
            channel.brand === undefined
              ? undefined
              : { backgroundColor: channel.brand.background, color: channel.brand.foreground }
          }
          title={t(`channel.${channel.labelKey}`)}
        >
          <ChannelIcon className="size-4" />
          <span className="sr-only">{t(`channel.${channel.labelKey}`)}</span>
          <span className="flex items-center gap-1 text-base leading-none font-medium tabular-nums">
            <span className="text-sm font-normal opacity-60">#</span>
            {row.shortNumber}
          </span>
        </span>

        <span className="flex w-16 shrink-0 items-center justify-center px-2 py-2">
          {remaining !== null && isOpen ? (
            <CountdownRing
              progress={remaining.progress}
              tone={remaining.tone}
              label={countdownParts.label}
              {...(countdownParts.sublabel === undefined
                ? {}
                : { sublabel: countdownParts.sublabel })}
              ariaLabel={t(remaining.late ? 'card.overdueByAria' : 'card.remainingAria', {
                duration: `${countdownParts.label} ${countdownParts.sublabel ?? ''}`.trim(),
              })}
            />
          ) : null}
        </span>

        <span className="flex w-20 shrink-0 flex-col justify-center px-3 py-2">
          <span className="text-base leading-tight font-semibold tabular-nums">
            {promisedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="text-muted-foreground text-xs">{dayWord}</span>
        </span>

        <span className="hidden w-40 shrink-0 flex-col justify-center px-3 py-2 sm:flex">
          <span className="flex items-center gap-1.5 text-sm">
            <OrderTypeIcon className="text-muted-foreground size-4" />
            {t(`card.${ORDER_TYPE_LABEL_KEY[row.orderType]}`)}
          </span>
          {tableLabel !== null ? (
            <span
              data-testid="order-row-table-line"
              className="text-muted-foreground truncate text-xs"
            >
              {tableLabel}
            </span>
          ) : null}
        </span>

        <span className="hidden min-w-0 flex-1 flex-col justify-center px-3 py-2 md:flex">
          <span className="truncate text-sm">{row.customerName ?? '—'}</span>
          <span className="text-muted-foreground truncate text-xs">
            {row.customerPhone ?? t('card.itemCount', { count: row.itemCount })}
          </span>
        </span>

        {showLocationBadge ? (
          <span className="hidden items-center px-3 lg:flex">
            <Badge variant="outline" className="gap-1">
              <MapPin className="size-3" />
              {row.locationName}
            </Badge>
          </span>
        ) : null}
      </button>

      <div className="flex shrink-0 items-center gap-2 border-l px-3">
        {state === 'new' || state === 'escalated' ? (
          <>
            <AcceptPopover order={row} />
            <RejectPopover order={row} />
          </>
        ) : state === 'accepted' ? (
          <Button
            size="sm"
            disabled={advanceMutation.isPending}
            onClick={() => {
              advanceMutation.mutate('preparing');
            }}
          >
            {t('card.startPreparingBtn')}
          </Button>
        ) : state === 'preparing' ? (
          <Button
            size="sm"
            disabled={advanceMutation.isPending}
            onClick={() => {
              advanceMutation.mutate('ready');
            }}
          >
            {t('card.markReadyBtn')}
          </Button>
        ) : state === 'ready' ? (
          <Button
            size="sm"
            disabled={advanceMutation.isPending}
            onClick={() => {
              advanceMutation.mutate('completed');
            }}
          >
            {t('card.completeBtn')}
          </Button>
        ) : row.hasFailedRefund && can('order', 'cancel') ? (
          <Button
            size="sm"
            variant="destructive"
            className="gap-1"
            disabled={retryMutation.isPending}
            onClick={() => {
              retryMutation.mutate();
            }}
          >
            <AlertCircle className="size-4" />
            {t('refund.retryBtn')}
          </Button>
        ) : null}
      </div>

      <span className="flex w-24 shrink-0 flex-col justify-center gap-1 border-l pt-2">
        <span className="px-2 text-center text-sm font-semibold tabular-nums">
          {money(row.total, row.currency)}
        </span>
        {row.hasFailedRefund ? (
          <OrderRefundFailedBadge />
        ) : (
          <span
            className={cn(
              'text-muted-foreground w-full py-px text-center text-[10px] leading-tight',
              // Colour is spent on the countdown and the row state; how the guest pays is a fact
              // to read, not an alarm to raise.
              paymentKey === 'unpaid' && 'text-destructive',
            )}
          >
            {t(`payment.${paymentKey}`)}
          </span>
        )}
      </span>
    </div>
  );
}
