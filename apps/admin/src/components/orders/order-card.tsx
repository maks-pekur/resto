import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, MapPin, ShoppingBag, Truck, UtensilsCrossed } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, formatMoney } from '@/lib/utils';
import { formatDuration } from '@/lib/menu/format-age';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { usePermissions } from '@/hooks/use-permissions';
import { advanceOrderStatusMutation, retryRefundMutation } from '@/lib/queries/orders';
import type { OrderFeedRowApi } from '@/lib/queries/orders';
import {
  OrderRefundFailedBadge,
  OrderStatusBadge,
  type OrderCardState,
} from './order-status-badge';
import { AcceptPopover } from './accept-popover';
import { RejectPopover } from './reject-popover';

export const UNACCEPTED_ESCALATION_MS = 5 * 60_000;

export type OrderCardStateSource = Pick<OrderFeedRowApi, 'status' | 'acceptedAt' | 'createdAt'>;

export function deriveOrderCardState(row: OrderCardStateSource, now: number): OrderCardState {
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

const FULFILLMENT_ICON: Record<
  OrderFeedRowApi['fulfillmentMode'],
  React.ComponentType<{ className?: string }>
> = {
  dine_in: UtensilsCrossed,
  pickup: ShoppingBag,
  delivery: Truck,
};

export const FULFILLMENT_LABEL_KEY: Record<OrderFeedRowApi['fulfillmentMode'], string> = {
  dine_in: 'fulfillmentDineIn',
  pickup: 'fulfillmentPickup',
  delivery: 'fulfillmentDelivery',
};

export interface OrderCardProps {
  readonly row: OrderFeedRowApi;
  readonly showLocationBadge: boolean;
  readonly onOpenDetail: (row: OrderFeedRowApi) => void;
}

export function OrderCard({
  row,
  showLocationBadge,
  onOpenDetail,
}: OrderCardProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'orders' });
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const now = Date.now();
  const state = deriveOrderCardState(row, now);
  const isTerminal = state === 'completed' || state === 'canceled';

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
      void queryClient.invalidateQueries({ queryKey: ['orders', 'feed'] });
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
        t('refund.successToast', { amount: formatMoney(res.data.amountMinor / 100, row.currency) }),
      );
      void queryClient.invalidateQueries({ queryKey: ['orders', 'feed'] });
      void queryClient.invalidateQueries({ queryKey: ['orders', 'detail'] });
    },
    onError: () => {
      showError(null, t('refund.failedToast'));
    },
  });

  const cardClassName =
    state === 'escalated'
      ? 'bg-destructive/10 border-2 border-destructive'
      : row.hasFailedRefund
        ? 'bg-destructive/10'
        : state === 'ready'
          ? 'border-l-4 border-success'
          : isTerminal
            ? 'bg-muted/40 opacity-80'
            : undefined;

  const stateEnteredAt =
    state === 'new'
      ? row.createdAt
      : state === 'accepted'
        ? row.acceptedAt
        : state === 'preparing'
          ? row.preparingAt
          : state === 'ready'
            ? row.readyAt
            : null;

  const ageMs = stateEnteredAt !== null ? now - new Date(stateEnteredAt).getTime() : null;
  const escalatedDuration =
    state === 'escalated' ? formatDuration(now - new Date(row.createdAt).getTime()) : undefined;

  const FulfillmentIcon = FULFILLMENT_ICON[row.fulfillmentMode];
  const tableLabel =
    row.tableZoneName !== null && row.tableNumber !== null
      ? t('card.tableLabel', { zone: row.tableZoneName, number: row.tableNumber })
      : row.tableIdentifier;

  return (
    <Card data-testid={`order-card-${row.id}`} className={cn('gap-2 p-4', cardClassName)}>
      <button
        type="button"
        className="flex flex-col gap-2 text-left"
        onClick={() => {
          onOpenDetail(row);
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-[28px] leading-tight font-semibold">
            {t('card.dailyNumber', { n: row.shortNumber })}
          </span>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              {showLocationBadge ? (
                <Badge
                  variant="outline"
                  aria-label={t('card.locationBadgeAria', { name: row.locationName })}
                >
                  <MapPin className="size-3" />
                  {row.locationName}
                </Badge>
              ) : null}
              <OrderStatusBadge state={state} escalatedDuration={escalatedDuration} />
            </div>
            {row.hasFailedRefund ? <OrderRefundFailedBadge /> : null}
            {ageMs !== null && state !== 'escalated' ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={cn('text-xs', AGE_BAND_CLASS(ageMs))}>
                    {formatDuration(ageMs)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {new Date(stateEnteredAt ?? row.createdAt).toLocaleString('ru-RU')}
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{t('card.itemCount', { count: row.itemCount })}</span>
          <FulfillmentIcon className="size-4" />
          <span>{t(`card.${FULFILLMENT_LABEL_KEY[row.fulfillmentMode]}`)}</span>
        </div>
        {tableLabel !== null ? (
          <span data-testid="order-card-table-line" className="text-sm text-muted-foreground">
            {tableLabel}
          </span>
        ) : null}
      </button>

      {state === 'new' || state === 'escalated' ? (
        <div className="flex gap-2">
          <AcceptPopover order={row} />
          <RejectPopover order={row} />
        </div>
      ) : state === 'accepted' ? (
        <Button
          size="lg"
          className="h-12 w-full"
          disabled={advanceMutation.isPending}
          onClick={() => {
            advanceMutation.mutate('preparing');
          }}
        >
          {t('card.startPreparingBtn')}
        </Button>
      ) : state === 'preparing' ? (
        <Button
          size="lg"
          className="h-12 w-full"
          disabled={advanceMutation.isPending}
          onClick={() => {
            advanceMutation.mutate('ready');
          }}
        >
          {t('card.markReadyBtn')}
        </Button>
      ) : state === 'ready' ? (
        <Button
          size="lg"
          className="h-12 w-full"
          disabled={advanceMutation.isPending}
          onClick={() => {
            advanceMutation.mutate('completed');
          }}
        >
          {t('card.completeBtn')}
        </Button>
      ) : row.hasFailedRefund && can('order', 'cancel') ? (
        <Button
          size="lg"
          variant="destructive"
          className="h-12 w-full gap-1"
          disabled={retryMutation.isPending}
          onClick={() => {
            retryMutation.mutate();
          }}
        >
          <AlertCircle className="size-4" />
          {t('refund.retryBtn')}
        </Button>
      ) : null}
    </Card>
  );
}
