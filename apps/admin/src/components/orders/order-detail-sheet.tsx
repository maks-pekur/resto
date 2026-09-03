import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Minus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDuration } from '@/lib/menu/format-age';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { toMinorUnits } from '@/lib/utils';
import { useMoney } from '@/hooks/use-money';
import { usePermissions } from '@/hooks/use-permissions';
import {
  orderDetailQuery,
  advanceOrderStatusMutation,
  refundOrderMutation,
  retryRefundMutation,
  type OrderDetailApi,
  type OrderFeedRowApi,
} from '@/lib/queries/orders';
import { OrderStatusBadge } from './order-status-badge';
import { AGE_BAND_CLASS, deriveOrderRowState } from './order-row';
import { REASON_LABEL_KEYS, type OrderCancelReasonCode } from './reject-popover';
import { CancelDialog } from './cancel-dialog';

const CANCELABLE_STATUSES: readonly string[] = ['placed', 'accepted', 'preparing', 'ready'];
const REFUNDABLE_STATUSES: readonly string[] = ['completed'];

const ORDER_TYPE_LABEL_KEY: Record<OrderDetailApi['orderType'], string> = {
  dine_in: 'card.orderTypeDineIn',
  pickup: 'card.orderTypePickup',
  delivery: 'card.orderTypeDelivery',
};

const ADVANCE_TRANSITIONS: Record<
  string,
  { readonly target: 'preparing' | 'ready' | 'completed'; readonly labelKey: string } | undefined
> = {
  accepted: { target: 'preparing', labelKey: 'card.startPreparingBtn' },
  preparing: { target: 'ready', labelKey: 'card.markReadyBtn' },
  ready: { target: 'completed', labelKey: 'card.completeBtn' },
};

const TIMELINE_KEYS: readonly {
  readonly field: 'createdAt' | 'acceptedAt' | 'preparingAt' | 'readyAt' | 'completedAt';
  readonly labelKey: string;
}[] = [
  { field: 'createdAt', labelKey: 'detail.timelineCreated' },
  { field: 'acceptedAt', labelKey: 'detail.timelineAccepted' },
  { field: 'preparingAt', labelKey: 'detail.timelinePreparing' },
  { field: 'readyAt', labelKey: 'detail.timelineReady' },
  { field: 'completedAt', labelKey: 'detail.timelineCompleted' },
];

interface TimelineRow {
  readonly field: string;
  readonly labelKey: string;
  readonly timestamp: string;
}

interface OrderDetailBodyProps {
  readonly order: OrderFeedRowApi;
  readonly onClose: () => void;
}

function OrderDetailBody({ order, onClose }: OrderDetailBodyProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'orders' });
  const money = useMoney();
  const { t: tCommon } = useTranslation('translation', { keyPrefix: 'common' });
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const now = Date.now();

  const detailQuery = useQuery(orderDetailQuery(order.id, order.locationId));
  const detail = detailQuery.data?.data ?? null;

  const [refundAmount, setRefundAmount] = React.useState('');
  const [refundReason, setRefundReason] = React.useState('');

  React.useEffect(() => {
    if (detail) setRefundAmount(detail.total);
  }, [detail?.id, detail?.total]);

  const advanceMutation = useMutation({
    mutationFn: (targetStatus: 'preparing' | 'ready' | 'completed') =>
      advanceOrderStatusMutation({
        orderId: order.id,
        locationId: order.locationId,
        targetStatus,
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        showError(null, t('card.statusUpdateFailed'));
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['orders', 'feed'] });
      void queryClient.invalidateQueries({ queryKey: ['orders', 'detail'] });
    },
    onError: () => {
      showError(null, t('card.statusUpdateFailed'));
    },
  });

  const refundMutation = useMutation({
    mutationFn: () =>
      refundOrderMutation({
        orderId: order.id,
        locationId: order.locationId,
        amountMinor: toMinorUnits(refundAmount),
        reason: refundReason.trim(),
      }),
    onSuccess: (res) => {
      if (!res.ok || !res.data) {
        showError(null, t('refund.failedToast'));
        return;
      }
      showSuccess(
        t('refund.successToast', { amount: money(refundAmount, detail?.currency ?? '') }),
      );
      setRefundReason('');
      void queryClient.invalidateQueries({ queryKey: ['orders', 'feed'] });
      void queryClient.invalidateQueries({ queryKey: ['orders', 'detail'] });
    },
    onError: () => {
      showError(null, t('refund.failedToast'));
    },
  });

  const retryMutation = useMutation({
    mutationFn: () => retryRefundMutation({ orderId: order.id, locationId: order.locationId }),
    onSuccess: (res) => {
      if (!res.ok || !res.data) {
        showError(null, t('refund.failedToast'));
        return;
      }
      showSuccess(
        t('refund.successToast', {
          amount: money(res.data.amountMinor / 100, detail?.currency ?? ''),
        }),
      );
      void queryClient.invalidateQueries({ queryKey: ['orders', 'feed'] });
      void queryClient.invalidateQueries({ queryKey: ['orders', 'detail'] });
    },
    onError: () => {
      showError(null, t('refund.failedToast'));
    },
  });

  if (!detail) {
    return <div className="p-4 text-sm text-muted-foreground">{tCommon('loading')}</div>;
  }

  const state = deriveOrderRowState(detail, now);
  const stateEnteredAt =
    state === 'new'
      ? detail.createdAt
      : state === 'accepted'
        ? detail.acceptedAt
        : state === 'preparing'
          ? detail.preparingAt
          : state === 'ready'
            ? detail.readyAt
            : null;
  const ageMs = stateEnteredAt !== null ? now - new Date(stateEnteredAt).getTime() : null;
  const escalatedDuration =
    state === 'escalated' ? formatDuration(now - new Date(detail.createdAt).getTime()) : undefined;

  const transition = ADVANCE_TRANSITIONS[detail.status];

  const timelineRows: TimelineRow[] = TIMELINE_KEYS.flatMap((entry) => {
    const timestamp = detail[entry.field];
    return timestamp === null ? [] : [{ field: entry.field, labelKey: entry.labelKey, timestamp }];
  });
  const canceledReasonLabel =
    detail.cancelReason !== null &&
    (Object.prototype.hasOwnProperty.call(REASON_LABEL_KEYS, detail.cancelReason)
      ? t(REASON_LABEL_KEYS[detail.cancelReason as OrderCancelReasonCode])
      : detail.cancelReason);

  const canRefund = can('billing', 'update') && REFUNDABLE_STATUSES.includes(detail.status);
  const canCancel = can('order', 'cancel') && CANCELABLE_STATUSES.includes(detail.status);
  const canRetry = can('order', 'cancel');
  const refundDisabled =
    refundMutation.isPending || refundAmount.trim() === '' || refundReason.trim() === '';

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
      {detail.review === null ? null : (
        <div className="bg-muted flex flex-col gap-1 rounded-md p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span aria-hidden>{'★'.repeat(detail.review.rating)}</span>
            <span className="text-muted-foreground">
              {t('review.rating', { rating: detail.review.rating })}
            </span>
          </div>
          {detail.review.comment === null ? null : (
            <p className="text-sm whitespace-pre-line">{detail.review.comment}</p>
          )}
        </div>
      )}

      {detail.hasFailedRefund ? (
        <div className="flex flex-col gap-1 rounded-md border border-destructive bg-destructive/10 p-3 text-destructive">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm">
              <AlertTriangle className="size-4" />
              {t('refund.failedBanner', {
                amount: money(detail.failedRefundAmount ?? detail.total, detail.currency),
              })}
            </span>
            {canRetry ? (
              <Button
                size="sm"
                variant="outline"
                className="border-destructive text-destructive"
                disabled={retryMutation.isPending}
                onClick={() => {
                  retryMutation.mutate();
                }}
              >
                {tCommon('retry')}
              </Button>
            ) : null}
          </div>
          {detail.failedRefundReason !== null ? (
            <span className="text-xs text-destructive/80">{detail.failedRefundReason}</span>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[28px] leading-tight font-semibold">
              {t('card.dailyNumber', { n: detail.shortNumber })}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {t('detail.internalNumberLabel')}: {detail.orderNumber}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <OrderStatusBadge state={state} escalatedDuration={escalatedDuration} />
            {ageMs !== null && state !== 'escalated' ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={`text-xs ${AGE_BAND_CLASS(ageMs)}`}>
                    {formatDuration(ageMs)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {new Date(stateEnteredAt ?? detail.createdAt).toLocaleString('ru-RU')}
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>

        {transition ? (
          <Button
            size="lg"
            className="h-12 w-full"
            disabled={advanceMutation.isPending}
            onClick={() => {
              advanceMutation.mutate(transition.target);
            }}
          >
            {t(transition.labelKey)}
          </Button>
        ) : null}

        <div className="flex flex-col gap-1 text-sm">
          <span>{t(ORDER_TYPE_LABEL_KEY[detail.orderType])}</span>
          {detail.tableZoneName !== null && detail.tableNumber !== null ? (
            <span className="text-muted-foreground">
              {t('detail.tableIdentifierLabel')}:{' '}
              {t('card.tableLabel', { zone: detail.tableZoneName, number: detail.tableNumber })}
            </span>
          ) : detail.tableIdentifier !== null ? (
            <span className="text-muted-foreground">
              {t('detail.tableIdentifierLabel')}: {detail.tableIdentifier}
            </span>
          ) : null}
          {detail.scheduledFor !== null ? (
            <span className="text-muted-foreground">
              {t('detail.scheduledForLabel')}:{' '}
              {new Date(detail.scheduledFor).toLocaleString('ru-RU')}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">{t('detail.customerTitle')}</h3>
          {detail.customerName !== null ? (
            <span className="text-sm">{detail.customerName}</span>
          ) : null}
          {detail.customerPhone !== null ? (
            <a href={`tel:${detail.customerPhone}`} className="text-sm text-primary underline">
              {detail.customerPhone}
            </a>
          ) : null}
          {detail.customerEmail !== null ? (
            <span className="text-sm text-muted-foreground">{detail.customerEmail}</span>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t('detail.itemsTitle')}</h3>
          <div className="flex flex-col gap-2">
            {detail.items.map((item) => {
              const addedModifiers = item.modifiers.filter((modifier) => modifier.kind === 'added');
              const excludedModifiers = item.modifiers.filter(
                (modifier) => modifier.kind === 'excluded',
              );
              return (
                <div key={item.id} className="flex flex-col gap-0.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      {item.nameSnapshot} × {item.quantity}
                    </span>
                    <span>{money(item.lineTotal, item.currency)}</span>
                  </div>
                  {addedModifiers.map((modifier, index) => (
                    <span
                      key={`${item.id}-${index.toString()}`}
                      className="pl-4 text-xs text-muted-foreground"
                    >
                      {modifier.nameSnapshot}
                    </span>
                  ))}
                  {excludedModifiers.length > 0 ? (
                    <span
                      data-testid={`order-item-excluded-${item.id}`}
                      className="flex items-center gap-1 pl-4 text-xs text-muted-foreground"
                    >
                      <Minus className="size-3" aria-hidden="true" />
                      {t('detail.excludedLabel')}{' '}
                      {excludedModifiers.map((modifier) => modifier.nameSnapshot).join(', ')}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <Separator />
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('detail.totalsSubtotal')}</span>
              <span>{money(detail.subtotal, detail.currency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('detail.totalsService')}</span>
              <span>{money(detail.serviceFee, detail.currency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('detail.totalsDiscount')}</span>
              <span>{money(detail.discount, detail.currency)}</span>
            </div>
            <div className="flex items-center justify-between font-semibold">
              <span>{t('detail.totalsTotal')}</span>
              <span>{money(detail.total, detail.currency)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t('detail.timelineTitle')}</h3>
          <div className="flex flex-col gap-1.5">
            {timelineRows.map((entry) => (
              <div key={entry.field} className="flex items-center gap-2 text-xs">
                <span className="size-1.5 rounded-full bg-primary" />
                <span className="text-muted-foreground">{t(entry.labelKey)}</span>
                <span>{new Date(entry.timestamp).toLocaleString('ru-RU')}</span>
              </div>
            ))}
            {detail.canceledAt !== null ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="size-1.5 rounded-full bg-destructive" />
                <span className="text-muted-foreground">{t('detail.timelineCanceled')}</span>
                <span>{new Date(detail.canceledAt).toLocaleString('ru-RU')}</span>
                {canceledReasonLabel ? (
                  <span className="text-muted-foreground">— {canceledReasonLabel}</span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {canRefund ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t('refund.title')}</h3>
            <p className="text-xs text-muted-foreground">
              {t('refund.remainingHint', { amount: money(detail.total, detail.currency) })}
            </p>
            <label className="text-sm" htmlFor="refund-amount">
              {t('refund.amountLabel')}
            </label>
            <Input
              id="refund-amount"
              type="number"
              min={0}
              step="0.01"
              value={refundAmount}
              onChange={(event) => {
                setRefundAmount(event.target.value);
              }}
            />
            <label className="text-sm" htmlFor="refund-reason">
              {t('refund.reasonLabel')}
            </label>
            <Textarea
              id="refund-reason"
              placeholder={t('refund.reasonPlaceholder')}
              value={refundReason}
              onChange={(event) => {
                setRefundReason(event.target.value);
              }}
            />
            <Button
              disabled={refundDisabled}
              onClick={() => {
                refundMutation.mutate();
              }}
            >
              {t('refund.submitBtn')}
            </Button>
          </div>
        ) : null}

        <Separator />

        {canCancel ? (
          <CancelDialog
            order={{
              id: detail.id,
              shortNumber: detail.shortNumber,
              locationId: detail.locationId,
              total: detail.total,
              currency: detail.currency,
            }}
            onCanceled={onClose}
          />
        ) : null}
      </div>
    </div>
  );
}

export interface OrderDetailSheetProps {
  readonly order: OrderFeedRowApi | null;
  readonly onOpenChange: (open: boolean) => void;
}

export function OrderDetailSheet({
  order,
  onOpenChange,
}: OrderDetailSheetProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'orders' });
  return (
    <Sheet open={order !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="sr-only">
          <SheetTitle>
            {order ? t('card.dailyNumber', { n: order.shortNumber }) : t('detail.itemsTitle')}
          </SheetTitle>
        </SheetHeader>
        {order ? (
          <OrderDetailBody
            order={order}
            onClose={() => {
              onOpenChange(false);
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
