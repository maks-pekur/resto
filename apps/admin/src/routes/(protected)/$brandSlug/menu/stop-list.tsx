import { createRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Route as menuLayoutRoute } from './_layout';
import { stopListQuery, stopListAggregateQuery } from '@/lib/queries/catalog';
import { useEffectiveLocation } from '@/lib/hooks/use-effective-location';
import { PageHeading } from '@/components/page-heading';
import { StopListTable } from '@/components/menu/stop-list-table';
import { StopListAggregateTable } from '@/components/menu/stop-list-aggregate-table';
import { TodaysWidget } from '@/components/menu/todays-86-widget';
import { TodaysWidgetResetButton } from '@/components/menu/todays-86-reset-button';

// D-17/RESEARCH.md Pattern 3: loaderDeps makes the loader re-run on
// ?location changes; 'all' prefetches the aggregate, a concrete id
// prefetches the single-location list. `location` absent/undefined means
// the effective value hasn't resolved yet (D-03 default) — the component's
// own useEffectiveLocation()-driven useQuery is the render-time source of
// truth either way.
export const Route = createRoute({
  getParentRoute: () => menuLayoutRoute,
  path: '/stop-list',
  loaderDeps: ({ search }) => ({ location: search.location }),
  loader: ({ context: { queryClient }, params: { brandSlug }, deps }) => {
    if (deps.location === undefined) return undefined;
    if (deps.location === 'all') {
      return queryClient.ensureQueryData(stopListAggregateQuery(brandSlug));
    }
    return queryClient.ensureQueryData(stopListQuery(brandSlug, deps.location));
  },
  component: StopListPage,
});

function StopListPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.stopList' });
  const { brandSlug } = Route.useParams();
  const { mode, locationId } = useEffectiveLocation();

  const { data: singleResult } = useQuery({
    ...stopListQuery(brandSlug, locationId ?? ''),
    enabled: mode === 'single' && locationId !== undefined,
  });
  const { data: aggregateResult } = useQuery({
    ...stopListAggregateQuery(brandSlug),
    enabled: mode === 'all',
  });

  const items = singleResult?.data?.items ?? [];
  const aggregateItems = aggregateResult?.data?.items ?? [];
  const totalActiveLocations = aggregateResult?.data?.totalActiveLocations ?? 0;
  const totalStoppedItems = aggregateResult?.data?.totalStoppedItems ?? 0;
  const count = mode === 'all' ? totalStoppedItems : items.length;

  return (
    <>
      <PageHeading
        title={t('pageTitle')}
        action={
          mode === 'single' && locationId !== undefined ? (
            <TodaysWidgetResetButton brandSlug={brandSlug} locationId={locationId} />
          ) : undefined
        }
      />
      <div className="flex flex-col gap-6 px-4 lg:px-6">
        <TodaysWidget count={count} />
        {mode === 'all' ? (
          <StopListAggregateTable
            items={aggregateItems}
            totalActiveLocations={totalActiveLocations}
            totalStoppedItems={totalStoppedItems}
          />
        ) : (
          <StopListTable brandSlug={brandSlug} items={items} locationId={locationId ?? ''} />
        )}
      </div>
    </>
  );
}
