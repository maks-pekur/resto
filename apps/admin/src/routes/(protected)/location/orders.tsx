import { useMemo, useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { RefreshCw, WifiOff } from 'lucide-react';
import { Route as locationLayoutRoute } from './_layout';
import { requirePermission } from '@/lib/auth/permissions';
import { formatMoney } from '@/lib/utils';
import {
  ordersFeedQuery,
  DEFAULT_ORDER_FEED_FILTERS,
  type OrderFeedRowApi,
  type OrderStatusPreset,
  type OrderDatePreset,
} from '@/lib/queries/orders';
import { useEffectiveLocation } from '@/hooks/use-effective-location';
import { useOrderSound } from '@/hooks/use-order-sound';
import { useOrderNotifications } from '@/hooks/use-order-notifications';
import { useTabTitle } from '@/hooks/use-tab-title';
import { PageHeading } from '@/components/common/page-heading';
import { EmptyState } from '@/components/common/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { FULFILLMENT_LABEL_KEY, OrderCard } from '@/components/orders/order-card';
import { OrderFilterBar } from '@/components/orders/order-filter-bar';
import { OrdersEmptyState } from '@/components/orders/orders-empty-state';
import { EnableAlertsBanner } from '@/components/orders/enable-alerts-banner';
import { OrderDetailSheet } from '@/components/orders/order-detail-sheet';
import { RefundFailedBanner } from '@/components/orders/refund-failed-banner';

/**
 * The feed is strictly single-location (founder, 2026-08-18), which is why it now lives under the
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

interface FeedGroups {
  readonly waiting: readonly OrderFeedRowApi[];
  readonly inProgress: readonly OrderFeedRowApi[];
  readonly done: readonly OrderFeedRowApi[];
}

function groupFeedRows(rows: readonly OrderFeedRowApi[]): FeedGroups {
  const waiting: OrderFeedRowApi[] = [];
  const inProgress: OrderFeedRowApi[] = [];
  const done: OrderFeedRowApi[] = [];
  for (const row of rows) {
    if (row.status === 'paid' && row.acceptedAt === null) {
      waiting.push(row);
    } else if (row.status === 'accepted' || row.status === 'preparing' || row.status === 'ready') {
      inProgress.push(row);
    } else {
      done.push(row);
    }
  }
  const byCreatedAsc = (a: OrderFeedRowApi, b: OrderFeedRowApi): number =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  waiting.sort(byCreatedAsc);
  inProgress.sort(byCreatedAsc);
  done.sort((a, b) => byCreatedAsc(b, a));
  return { waiting, inProgress, done };
}

function FeedGroupSection({
  title,
  rows,
  showLocationBadge,
  onOpenDetail,
}: {
  readonly title: string;
  readonly rows: readonly OrderFeedRowApi[];
  readonly showLocationBadge: boolean;
  readonly onOpenDetail: (row: OrderFeedRowApi) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="sticky top-12 z-[5] bg-background py-1 text-xs text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="mx-auto grid w-full max-w-[640px] grid-cols-1 gap-3 xl:max-w-none xl:grid-cols-2">
        {rows.map((row) => (
          <OrderCard
            key={row.id}
            row={row}
            showLocationBadge={showLocationBadge}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </div>
    </section>
  );
}

function OrdersPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'orders' });
  const { t: tNav } = useTranslation('translation', { keyPrefix: 'nav' });
  const { t: tCommon } = useTranslation('translation', { keyPrefix: 'common' });
  const { t: tCard } = useTranslation('translation', { keyPrefix: 'orders.card' });
  const { locationId } = useEffectiveLocation();
  const feedLocationId = locationId === 'all' ? undefined : locationId;

  const [statusFilter, setStatusFilter] = useState<OrderStatusPreset>(
    DEFAULT_ORDER_FEED_FILTERS.statusFilter ?? 'active',
  );
  const [datePreset, setDatePreset] = useState<OrderDatePreset>(
    DEFAULT_ORDER_FEED_FILTERS.datePreset ?? 'today',
  );
  const [openOrder, setOpenOrder] = useState<OrderFeedRowApi | null>(null);
  const filters = useMemo(() => ({ statusFilter, datePreset }), [statusFilter, datePreset]);

  const feedQuery = useQuery({
    ...ordersFeedQuery(feedLocationId ?? 'all', filters),
    enabled: feedLocationId !== undefined,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const rows = feedQuery.data?.data?.rows ?? [];
  const mainEmpty = feedQuery.isSuccess && rows.length === 0;

  const activationCheckQuery = useQuery({
    ...ordersFeedQuery(feedLocationId ?? 'all', {
      statusFilter: 'all_today',
      datePreset: 'week',
      limit: 1,
    }),
    enabled: feedLocationId !== undefined && mainEmpty,
  });
  const isActivationEmpty =
    mainEmpty &&
    activationCheckQuery.isSuccess &&
    (activationCheckQuery.data.data?.total ?? 0) === 0;

  const refundFailedCountQuery = useQuery({
    ...ordersFeedQuery(feedLocationId ?? 'all', {
      statusFilter: 'refund_failed',
      datePreset: 'week',
      limit: 1,
    }),
    enabled: feedLocationId !== undefined,
    refetchInterval: 5_000,
  });
  const refundFailedCount = refundFailedCountQuery.data?.data?.total ?? 0;

  const groups = useMemo(() => groupFeedRows(rows), [rows]);
  const showLocationBadge = false;

  const sound = useOrderSound(groups.waiting);
  const notifications = useOrderNotifications(groups.waiting, (row) => ({
    title: t('alerts.newOrderTitle', { number: row.shortNumber }),
    body: t('alerts.newOrderBody', {
      total: formatMoney(row.total, row.currency),
      mode: tCard(FULFILLMENT_LABEL_KEY[row.fulfillmentMode]),
    }),
  }));
  useTabTitle(groups.waiting.length);

  // Both permissions are bought with one click: the browser dialog opens from it, and the
  // same gesture is what an autoplay policy accepts in place of a permission it never offers.
  const enableAlerts = (): void => {
    sound.unlock();
    notifications.request();
  };
  const alertsPending = !sound.unlocked || notifications.permission === 'default';

  return (
    <>
      <PageHeading title={tNav('orders')} />
      {alertsPending ? <EnableAlertsBanner onEnable={enableAlerts} /> : null}
      <RefundFailedBanner
        count={refundFailedCount}
        onShowClick={() => {
          setStatusFilter('refund_failed');
        }}
      />
      <OrderFilterBar
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        datePreset={datePreset}
        onDatePresetChange={setDatePreset}
        isLive={!feedQuery.isRefetchError}
        soundMuted={sound.muted}
        onSoundMutedChange={sound.setMuted}
        soundBlocked={sound.blocked}
        soundReady={sound.unlocked}
        notificationsBlocked={notifications.permission === 'denied'}
      />
      <div className="flex flex-col gap-4 px-4 lg:px-6">
        {feedQuery.isRefetchError ? (
          <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
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
          <div className="flex flex-col gap-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : feedQuery.isError && !feedQuery.isRefetchError ? (
          <div
            role="alert"
            className="flex flex-col items-center justify-center gap-4 px-6 py-12 text-center"
          >
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <WifiOff className="size-6" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h2 className="text-lg font-medium">{t('error.initialLoadTitle')}</h2>
              <p className="text-sm text-muted-foreground">{t('error.initialLoadBody')}</p>
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
        ) : isActivationEmpty ? (
          <OrdersEmptyState />
        ) : mainEmpty ? (
          <EmptyState
            variant="empty"
            title={t('empty.filteredTitle')}
            description={t('empty.filteredBody')}
          />
        ) : (
          <div className="flex flex-col gap-6">
            <FeedGroupSection
              title={t('feed.groupWaiting')}
              rows={groups.waiting}
              showLocationBadge={showLocationBadge}
              onOpenDetail={setOpenOrder}
            />
            <FeedGroupSection
              title={t('feed.groupInProgress')}
              rows={groups.inProgress}
              showLocationBadge={showLocationBadge}
              onOpenDetail={setOpenOrder}
            />
            <FeedGroupSection
              title={t('feed.groupDone')}
              rows={groups.done}
              showLocationBadge={showLocationBadge}
              onOpenDetail={setOpenOrder}
            />
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
