import { createRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus } from 'lucide-react';
import { Route as protectedLayoutRoute } from './_layout';
import { hasPermission, requirePermission } from '@/lib/auth/permissions';
import { meQuery } from '@/lib/queries/identity';
import { tenantLocationsQuery } from '@/lib/queries/locations';
import { tableZonesQuery } from '@/lib/queries/table-zones';
import { PageHeading } from '@/components/common/page-heading';
import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';
import { ZoneList } from '@/components/tables/zone-list';

export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/locations/$slug/tables',
  beforeLoad: requirePermission('table', 'read'),
  loader: async ({ context: { queryClient }, params: { slug } }) => {
    const locationsResult = await queryClient.ensureQueryData(tenantLocationsQuery());
    const location = (locationsResult.data ?? []).find((loc) => loc.slug === slug);
    if (location) {
      await queryClient.ensureQueryData(tableZonesQuery(location.id));
    }
  },
  component: TablesPage,
});

function TablesPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useTranslation('translation', { keyPrefix: 'tables' });

  const { data: meResult } = useQuery(meQuery());
  const me = meResult?.data ?? null;
  const canUpdate = hasPermission(me, 'table', 'update');

  const { data: locationsResult, isPending: isLocationsPending } = useQuery(tenantLocationsQuery());
  const location = (locationsResult?.data ?? []).find((loc) => loc.slug === slug);

  const { data: zonesResult, isPending: isZonesPending } = useQuery({
    ...tableZonesQuery(location?.id ?? ''),
    enabled: location !== undefined,
  });

  if (isLocationsPending) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (!location) {
    return (
      <EmptyState
        variant="empty"
        title="No such location"
        description="It may have been archived, or the address in the URL is out of date."
        action={
          <Button
            onClick={() => {
              void navigate({ to: '/locations' });
            }}
          >
            Back to locations
          </Button>
        }
      />
    );
  }

  const zones = zonesResult?.data ?? [];

  return (
    <>
      <PageHeading
        title={t('pageTitle')}
        action={
          canUpdate ? (
            <Button asChild>
              <Link to="/locations/$slug/tables/$zoneId" params={{ slug, zoneId: 'new' }}>
                <Plus className="size-4" />
                {t('createZoneBtn')}
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="flex flex-1 flex-col gap-6 px-4 pb-8 lg:px-6">
        {isZonesPending ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : zones.length === 0 ? (
          <EmptyState variant="empty" title={t('emptyTitle')} description={t('emptyDescription')} />
        ) : (
          <ZoneList zones={zones} locationSlug={slug} />
        )}
      </div>
    </>
  );
}
