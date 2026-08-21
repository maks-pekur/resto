import { createRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Route as protectedLayoutRoute } from './_layout';
import { stopListQuery, stopListAggregateQuery } from '@/lib/queries/catalog';
import { useEffectiveLocation } from '@/lib/hooks/use-effective-location';
import { useQuery } from '@tanstack/react-query';
import { SetupChecklistCard } from '@/components/setup-checklist-card';
import { PageHeading } from '@/components/page-heading';
import { EmptyState } from '@/components/empty-state';
import { TodaysWidget } from '@/components/menu/todays-86-widget';
import { Button } from '@/components/ui/button';

export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/',
  component: DashboardIndexPage,
});

function DashboardIndexPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'dashboard' });

  // D-17: `all` gets the aggregate branch so the dashboard never
  // white-screens (location.context_required) for an owner with no
  // location selected — closes the 08.4 gap. D-07: only stop-list-derived
  // counters render here, never a silently-empty order counter (order feed
  // is Phase 10).
  const { mode, locationId } = useEffectiveLocation();

  const { data: singleResult } = useQuery({
    ...stopListQuery(locationId ?? ''),
    enabled: mode === 'single' && locationId !== undefined,
  });
  const { data: aggregateResult } = useQuery({
    ...stopListAggregateQuery(),
    enabled: mode === 'all',
  });

  const stopCount =
    mode === 'all'
      ? (aggregateResult?.data?.totalStoppedItems ?? 0)
      : (singleResult?.data?.items ?? []).length;

  return (
    <>
      <PageHeading title={t('title')} />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        {mode === 'none' ? (
          // D-19: zero active locations (owner) — empty state + create-location
          // CTA, no stop widget, no default-location redirect.
          <EmptyState
            variant="empty"
            title={t('noLocationsTitle')}
            description={t('noLocationsDescription')}
            action={
              <Button asChild>
                <Link to="/locations">{t('createLocationCta')}</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <SetupChecklistCard />
            <TodaysWidget count={stopCount} />
          </div>
        )}
      </div>
    </>
  );
}
