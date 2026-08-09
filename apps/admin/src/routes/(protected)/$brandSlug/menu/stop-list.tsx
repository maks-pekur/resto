import { createRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Route as menuLayoutRoute } from './_layout';
import { stopListQuery } from '@/lib/queries/catalog';
import { useEffectiveLocation } from '@/lib/hooks/use-effective-location';
import { PageHeading } from '@/components/page-heading';
import { StopListTable } from '@/components/menu/stop-list-table';
import { TodaysWidget } from '@/components/menu/todays-86-widget';
import { TodaysWidgetResetButton } from '@/components/menu/todays-86-reset-button';

// D-12/D-17: the `loaderDeps` + `all`-aggregate branch (read-only, N/M badge)
// land in plan 05, which also replaces the loader this plan removed — a
// hook-driven loader isn't possible until then (loaders can't call hooks).
export const Route = createRoute({
  getParentRoute: () => menuLayoutRoute,
  path: '/stop-list',
  component: StopListPage,
});

function StopListPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.stopList' });
  const { brandSlug } = Route.useParams();
  const { mode, locationId } = useEffectiveLocation();
  const { data } = useQuery({
    ...stopListQuery(brandSlug, locationId ?? ''),
    enabled: mode === 'single' && locationId !== undefined,
  });
  const items = data?.data?.items ?? [];

  return (
    <>
      <PageHeading
        title={t('pageTitle')}
        action={<TodaysWidgetResetButton brandSlug={brandSlug} />}
      />
      <div className="flex flex-col gap-6 px-4 lg:px-6">
        <TodaysWidget count={items.length} />
        <StopListTable brandSlug={brandSlug} items={items} />
      </div>
    </>
  );
}
