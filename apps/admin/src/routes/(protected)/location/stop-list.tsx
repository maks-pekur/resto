import { createRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Route as locationLayoutRoute } from './_layout';
import { requirePermission } from '@/lib/auth/permissions';
import { modifierStopListQuery, stopListQuery } from '@/lib/queries/catalog';
import { useEffectiveLocation } from '@/hooks/use-effective-location';
import { PageHeading } from '@/components/common/page-heading';
import { Separator } from '@/components/ui/separator';
import { StopListTable } from '@/components/menu/stop-list-table';
import { ModifierStopListTable } from '@/components/menu/modifier-stop-list-table';
import { TodaysWidget } from '@/components/menu/todays-86-widget';
import { TodaysWidgetResetButton } from '@/components/menu/todays-86-reset-button';

/**
 * One point's stop list. It left the menu subtree when the location moved into the path: the
 * catalogue is brand-grain and this is not, and an address cannot claim both.
 *
 * There is no every-location mode here any more (founder, 2026-08-26). The overview the aggregate
 * gave lives on `/dashboard`, which is the page whose grain is declared mixed; a stop list you
 * cannot act on is a report, not a stop list.
 */
export const Route = createRoute({
  getParentRoute: () => locationLayoutRoute,
  path: '/stop-list',
  beforeLoad: requirePermission('menu', 'read'),
  loader: ({ context: { queryClient, activeLocation } }) =>
    Promise.all([
      queryClient.ensureQueryData(stopListQuery(activeLocation.id)),
      queryClient.ensureQueryData(modifierStopListQuery(activeLocation.id)),
    ]),
  component: StopListPage,
});

function StopListPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.stopList' });
  const { locationId } = useEffectiveLocation();
  const isSingleLocation = locationId !== undefined && locationId !== 'all';

  const { data: singleResult } = useQuery({
    ...stopListQuery(locationId ?? ''),
    enabled: isSingleLocation,
  });

  const { data: modifierResult } = useQuery({
    ...modifierStopListQuery(locationId ?? ''),
    enabled: isSingleLocation,
  });

  const items = singleResult?.data?.items ?? [];
  const modifiers = modifierResult?.data?.items ?? [];

  return (
    <>
      <PageHeading
        title={t('pageTitle')}
        action={isSingleLocation ? <TodaysWidgetResetButton locationId={locationId} /> : undefined}
      />
      <div className="flex flex-col gap-6 px-4 lg:px-6">
        <TodaysWidget count={items.length + modifiers.length} />
        <StopListTable items={items} locationId={locationId ?? ''} />
        {modifiers.length > 0 ? (
          <>
            <Separator />
            <h2 className="text-base font-semibold">{t('modifiersHeading')}</h2>
            <ModifierStopListTable items={modifiers} locationId={locationId ?? ''} />
          </>
        ) : null}
      </div>
    </>
  );
}
