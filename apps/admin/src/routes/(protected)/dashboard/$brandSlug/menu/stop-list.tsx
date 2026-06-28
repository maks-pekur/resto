import { createRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Route as menuLayoutRoute } from './_layout';
import { stopListQuery } from '@/lib/queries/catalog';
import { PageHeading } from '@/components/page-heading';
import { StopListTable } from '@/components/menu/stop-list-table';
import { TodaysWidget } from '@/components/menu/todays-86-widget';
import { TodaysWidgetResetButton } from '@/components/menu/todays-86-reset-button';

export const Route = createRoute({
  getParentRoute: () => menuLayoutRoute,
  path: '/stop-list',
  loader: ({ context: { queryClient }, params: { brandSlug } }) =>
    queryClient.ensureQueryData(stopListQuery(brandSlug)),
  component: StopListPage,
});

function StopListPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.stopList' });
  const { brandSlug } = Route.useParams();
  const { data } = useSuspenseQuery(stopListQuery(brandSlug));
  const items = data.data?.items ?? [];

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
