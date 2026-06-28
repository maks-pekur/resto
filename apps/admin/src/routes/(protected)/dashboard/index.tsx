import { createRoute } from '@tanstack/react-router';
import { useSuspenseQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Route as dashboardLayoutRoute } from './_layout';
import { meBrandsQuery } from '@/lib/queries/identity';
import { stopListQuery } from '@/lib/queries/catalog';
import { SetupChecklistCard } from '@/components/setup-checklist-card';
import { PageHeading } from '@/components/page-heading';
import { TodaysWidget } from '@/components/menu/todays-86-widget';

export const Route = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/',
  component: DashboardPage,
});

function DashboardPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'dashboard' });
  const { data: brandsResult } = useSuspenseQuery(meBrandsQuery());
  const brands = brandsResult.data?.brands ?? [];
  const brandsCount = brands.length;
  const firstBrandSlug = brands[0]?.slug ?? null;

  const { data: stopListResult } = useQuery({
    ...stopListQuery(firstBrandSlug ?? ''),
    enabled: firstBrandSlug !== null,
  });

  const stopCount = stopListResult?.data?.items.length ?? 0;

  return (
    <>
      <PageHeading title={t('title')} />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          <SetupChecklistCard brandsCount={brandsCount} />
          {firstBrandSlug !== null ? <TodaysWidget count={stopCount} /> : null}
        </div>
      </div>
    </>
  );
}
