import { createRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Route as brandSlugLayoutRoute } from './_layout';
import { meBrandsQuery } from '@/lib/queries/identity';
import { stopListQuery } from '@/lib/queries/catalog';
import { useEffectiveLocation } from '@/lib/hooks/use-effective-location';
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
  const brandsCount = (brandsResult?.data?.brands ?? []).length;

  // D-12/D-17: the `all` aggregate branch (merged count + N/M badge) is wired
  // in plan 05; this plumbing-only wave keeps the single-location count and
  // degrades to 0 in `all`/`none` mode, matching the pre-08.5 behavior.
  const { mode, locationId } = useEffectiveLocation();

  const { data: stopListResult } = useQuery({
    ...stopListQuery(brandSlug, locationId ?? ''),
    enabled: brandSlug !== '' && mode === 'single' && locationId !== undefined,
  });

  const stopCount = (stopListResult?.data?.items ?? []).length;

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
