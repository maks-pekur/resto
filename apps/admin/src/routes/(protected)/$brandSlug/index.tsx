import { createRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Route as brandSlugLayoutRoute } from './_layout';
import { meBrandsQuery } from '@/lib/queries/identity';
import { stopListQuery } from '@/lib/queries/catalog';
import { SetupChecklistCard } from '@/components/setup-checklist-card';
import { PageHeading } from '@/components/page-heading';
import { TodaysWidget } from '@/components/menu/todays-86-widget';

export const Route = createRoute({
  getParentRoute: () => brandSlugLayoutRoute,
  path: '/',
  component: BrandIndexPage,
});

function BrandIndexPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'dashboard' });
  const { brandSlug } = Route.useParams();
  const { data: brandsResult } = useQuery(meBrandsQuery());
  const brandsCount = brandsResult?.data?.brands.length ?? 0;

  const { data: stopListResult } = useQuery({
    ...stopListQuery(brandSlug),
    enabled: brandSlug !== '',
  });

  const stopCount = stopListResult?.data?.items.length ?? 0;

  return (
    <>
      <PageHeading title={t('title')} />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          <SetupChecklistCard brandsCount={brandsCount} />
          <TodaysWidget count={stopCount} />
        </div>
      </div>
    </>
  );
}
