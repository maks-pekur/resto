import { useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { RefreshCw, WifiOff } from 'lucide-react';
import { Route as locationLayoutRoute } from './_layout';
import { requirePermission } from '@/lib/auth/permissions';
import { formatMoney } from '@/lib/utils';
import {
  DEFAULT_ORDER_FEED_FILTERS,
  ordersCountsQuery,
  ordersFeedQuery,
  type OrderFeedRowApi,
  type OrderStatusPreset,
} from '@/lib/queries/orders';
import { buildPresetRange, type DateRange } from '@/lib/date-range';
import { useEffectiveLocation } from '@/hooks/use-effective-location';
import { useOrderSound } from '@/hooks/use-order-sound';
import { useOrderNotifications } from '@/hooks/use-order-notifications';
import { useTabTitle } from '@/hooks/use-tab-title';
import { PageHeading } from '@/components/common/page-heading';
import { EmptyState } from '@/components/common/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { FULFILLMENT_LABEL_KEY, OrderRow } from '@/components/orders/order-row';
import { OrderFilterBar } from '@/components/orders/order-filter-bar';
import { type OrderFulfillmentTab } from '@/components/orders/order-tabs';
import { EnableAlertsBanner } from '@/components/orders/enable-alerts-banner';
import { OrderDetailSheet } from '@/components/orders/order-detail-sheet';

/**
 * The feed is strictly single-location (founder, 2026-08-18), which is why it lives under the
 * slug: there is no address for an aggregate it does not have.
 */
export const Route = createRoute({
  getParentRoute: () => locationLayoutRoute,
  path: '/orders',
  beforeLoad: requirePermission('order', 'read'),
  loader: ({ context: { queryClient, activeLocation } }) =>
    queryClient.ensureQueryData(ordersFeedQuery(activeLocation.id, DEFAULT_ORDER_FEED_FILTERS)),
  component: OrdersPage,
});

const POLL_MS = 5_000;

function OrdersPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'orders' });
  const { t: tNav } = useTranslation('translation', { keyPrefix: 'nav' });
  const { t: tCommon } = useTranslation('translation', { keyPrefix: 'common' });
  const { t: tCard } = useTranslation('translation', { keyPrefix: 'orders.card' });
  const { locationId } = useEffectiveLocation();
  const feedLocationId = locationId === 'all' ? undefined : locationId;

  const [fulfillment, setFulfillment] = useState<OrderFulfillmentTab>('all');
  const [statusTab, setStatusTab] = useState<OrderStatusPreset>('unaccepted');
  const [range, setRange] = useState<DateRange>(() => buildPresetRange('today'));
  const [openOrder, setOpenOrder] = useState<OrderFeedRowApi | null>(null);

  const scope = {
    from: range.from,
    to: range.to,
    ...(fulfillment === 'all' ? {} : { fulfillmentMode: fulfillment }),
  };

  const feedQuery = useQuery({
    ...ordersFeedQuery(feedLocationId ?? 'all', { ...scope, statusFilter: statusTab }),
    enabled: feedLocationId !== undefined,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const countsQuery = useQuery({
    ...ordersCountsQuery(feedLocationId ?? 'all', scope),
    enabled: feedLocationId !== undefined,
    refetchInterval: POLL_MS,
  });

  const refundFailedCountQuery = useQuery({
    ...ordersFeedQuery(feedLocationId ?? 'all', {
      ...scope,
      statusFilter: 'refund_failed',
      limit: 1,
    }),
    enabled: feedLocationId !== undefined,
    refetchInterval: POLL_MS,
  });

  // The chime follows today's unaccepted orders whatever tab is on screen — an operator reading
  // yesterday's closed orders must still hear the one that just arrived.
  const alertsQuery = useQuery({
    ...ordersFeedQuery(feedLocationId ?? 'all', DEFAULT_ORDER_FEED_FILTERS),
    enabled: feedLocationId !== undefined,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  });

  const rows = feedQuery.data?.data?.rows ?? [];
  const counts = countsQuery.data?.data ?? null;
  const refundFailedCount = refundFailedCountQuery.data?.data?.total ?? 0;
  const waitingRows = alertsQuery.data?.data?.rows ?? [];

  const sound = useOrderSound(waitingRows);
  const notifications = useOrderNotifications(waitingRows, (row) => ({
    title: t('alerts.newOrderTitle', { number: row.shortNumber }),
    body: t('alerts.newOrderBody', {
      total: formatMoney(row.total, row.currency),
      mode: tCard(FULFILLMENT_LABEL_KEY[row.fulfillmentMode]),
    }),
  }));
  useTabTitle(waitingRows.length);

  // Both permissions are bought with one click: the browser dialog opens from it, and the same
  // gesture is what an autoplay policy accepts in place of a permission it never offers.
  const enableAlerts = (): void => {
    sound.unlock();
    notifications.request();
  };
  const alertsPending = !sound.unlocked || notifications.permission === 'default';

  return (
    <>
      <PageHeading title={tNav('orders')} />
      {alertsPending ? <EnableAlertsBanner onEnable={enableAlerts} /> : null}
      <OrderFilterBar
        fulfillment={fulfillment}
        onFulfillmentChange={setFulfillment}
        range={range}
        onRangeChange={setRange}
        soundMuted={sound.muted}
        onSoundMutedChange={sound.setMuted}
        soundBlocked={sound.blocked}
        soundReady={sound.unlocked}
        notificationsBlocked={notifications.permission === 'denied'}
        status={statusTab}
        onStatusChange={setStatusTab}
        counts={counts}
        refundFailedCount={refundFailedCount}
      />

      <div className="flex flex-col gap-4 px-4 lg:px-6">
        {feedQuery.isRefetchError ? (
          <div className="bg-muted/40 flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
            <span>
              {t('feed.staleNotice', {
                time: new Date(feedQuery.dataUpdatedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void feedQuery.refetch();
              }}
            >
              {t('feed.staleRetry')}
            </Button>
          </div>
        ) : null}

        {feedLocationId === undefined ? (
          <EmptyState
            variant="empty"
            title={t('empty.pickLocationTitle')}
            description={t('empty.pickLocationBody')}
          />
        ) : feedQuery.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : feedQuery.isError && !feedQuery.isRefetchError ? (
          <div
            role="alert"
            className="flex flex-col items-center justify-center gap-4 px-6 py-12 text-center"
          >
            <div className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
              <WifiOff className="size-6" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h2 className="text-lg font-medium">{t('error.initialLoadTitle')}</h2>
              <p className="text-muted-foreground text-sm">{t('error.initialLoadBody')}</p>
            </div>
            <Button
              onClick={() => {
                void feedQuery.refetch();
              }}
            >
              <RefreshCw className="size-4" />
              {tCommon('retry')}
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">{t('empty.noOrders')}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <div className="text-muted-foreground hidden border-b px-0 py-1.5 text-xs sm:flex">
              <span className="w-28 shrink-0 px-3">{t('table.number')}</span>
              <span className="w-20 shrink-0 px-3">{t('table.time')}</span>
              <span className="w-40 shrink-0 px-3">{t('table.type')}</span>
              <span className="hidden flex-1 px-3 md:block">{t('table.customer')}</span>
              <span className="w-32 shrink-0 px-3 text-right">{t('table.total')}</span>
            </div>
            {rows.map((row) => (
              <OrderRow
                key={row.id}
                row={row}
                showLocationBadge={false}
                onOpenDetail={setOpenOrder}
              />
            ))}
          </div>
        )}
      </div>
      <OrderDetailSheet
        order={openOrder}
        onOpenChange={(open) => {
          if (!open) setOpenOrder(null);
        }}
      />
    </>
  );
}
