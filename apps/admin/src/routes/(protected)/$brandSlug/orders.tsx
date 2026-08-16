import { useMemo, useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { RefreshCw, WifiOff } from 'lucide-react';
import { Route as brandSlugLayoutRoute } from './_layout';
import {
  ordersFeedQuery,
  DEFAULT_ORDER_FEED_FILTERS,
  type OrderFeedRowApi,
  type OrderStatusPreset,
  type OrderDatePreset,
} from '@/lib/queries/orders';
import { useEffectiveLocation } from '@/lib/hooks/use-effective-location';
import { useOrderSound } from '@/lib/hooks/use-order-sound';
import { useTabTitle } from '@/lib/hooks/use-tab-title';
import { PageHeading } from '@/components/page-heading';
import { EmptyState } from '@/components/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { OrderCard } from '@/components/orders/order-card';
import { OrderFilterBar } from '@/components/orders/order-filter-bar';
import { OrdersEmptyState } from '@/components/orders/orders-empty-state';
import { EnableSoundBanner } from '@/components/orders/enable-sound-banner';

export const Route = createRoute({
  getParentRoute: () => brandSlugLayoutRoute,
  path: '/orders',
  loaderDeps: ({ search }) => ({ location: search.location }),
  loader: ({ context: { queryClient }, params: { brandSlug }, deps }) => {
    if (deps.location === undefined) return undefined;
    return queryClient.ensureQueryData(
      ordersFeedQuery(brandSlug, deps.location, DEFAULT_ORDER_FEED_FILTERS),
    );
  },
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
  brandSlug,
  title,
  rows,
  showLocationBadge,
}: {
  readonly brandSlug: string;
  readonly title: string;
  readonly rows: readonly OrderFeedRowApi[];
  readonly showLocationBadge: boolean;
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
            brandSlug={brandSlug}
            row={row}
            showLocationBadge={showLocationBadge}
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
  const { brandSlug } = Route.useParams();
  const { mode, locationId } = useEffectiveLocation();

  const [statusFilter, setStatusFilter] = useState<OrderStatusPreset>(
    DEFAULT_ORDER_FEED_FILTERS.statusFilter ?? 'active',
  );
  const [datePreset, setDatePreset] = useState<OrderDatePreset>(
    DEFAULT_ORDER_FEED_FILTERS.datePreset ?? 'today',
  );
  const filters = useMemo(() => ({ statusFilter, datePreset }), [statusFilter, datePreset]);

  const feedQuery = useQuery({
    ...ordersFeedQuery(brandSlug, locationId ?? 'all', filters),
    enabled: locationId !== undefined,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const rows = feedQuery.data?.data?.rows ?? [];
  const mainEmpty = feedQuery.isSuccess && rows.length === 0;

  const activationCheckQuery = useQuery({
    ...ordersFeedQuery(brandSlug, locationId ?? 'all', {
      statusFilter: 'all_today',
      datePreset: 'week',
      limit: 1,
    }),
    enabled: locationId !== undefined && mainEmpty,
  });
  const isActivationEmpty =
    mainEmpty &&
    activationCheckQuery.isSuccess &&
    (activationCheckQuery.data.data?.total ?? 0) === 0;

  const groups = useMemo(() => groupFeedRows(rows), [rows]);
  const showLocationBadge = mode === 'all';

  const sound = useOrderSound(groups.waiting);
  useTabTitle(groups.waiting.length);

  return (
    <>
      <PageHeading title={tNav('orders')} />
      <EnableSoundBanner onUnlock={sound.unlock} />
      <OrderFilterBar
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        datePreset={datePreset}
        onDatePresetChange={setDatePreset}
        isLive={!feedQuery.isRefetchError}
        soundMuted={sound.muted}
        onSoundMutedChange={sound.setMuted}
        soundBlocked={sound.blocked}
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

        {feedQuery.isPending ? (
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
          <OrdersEmptyState brandSlug={brandSlug} />
        ) : mainEmpty ? (
          <EmptyState
            variant="empty"
            title={t('empty.filteredTitle')}
            description={t('empty.filteredBody')}
          />
        ) : (
          <div className="flex flex-col gap-6">
            <FeedGroupSection
              brandSlug={brandSlug}
              title={t('feed.groupWaiting')}
              rows={groups.waiting}
              showLocationBadge={showLocationBadge}
            />
            <FeedGroupSection
              brandSlug={brandSlug}
              title={t('feed.groupInProgress')}
              rows={groups.inProgress}
              showLocationBadge={showLocationBadge}
            />
            <FeedGroupSection
              brandSlug={brandSlug}
              title={t('feed.groupDone')}
              rows={groups.done}
              showLocationBadge={showLocationBadge}
            />
          </div>
        )}
      </div>
    </>
  );
}
