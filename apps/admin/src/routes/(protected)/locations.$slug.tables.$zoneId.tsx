import { createRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { Route as protectedLayoutRoute } from './_layout';
import { requirePermission } from '@/lib/auth/permissions';
import { meLocationsQuery } from '@/lib/queries/locations';
import { tableZonesQuery } from '@/lib/queries/table-zones';
import { PageHeading } from '@/components/common/page-heading';
import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';
import { ZoneForm } from '@/components/tables/zone-form';
import { ZoneDetail } from '@/components/tables/zone-detail';

const NEW_ZONE = 'new';

export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/locations/$slug/tables/$zoneId',
  beforeLoad: requirePermission('table', 'read'),
  component: ZonePage,
});

function ZonePage() {
  const { t } = useTranslation('translation', { keyPrefix: 'tables' });
  const { slug, zoneId } = Route.useParams();
  const navigate = useNavigate();

  const { data: locationsResult } = useQuery(meLocationsQuery());
  const location = (locationsResult?.data?.locations ?? []).find((item) => item.slug === slug);

  const { data: zonesResult, isPending } = useQuery({
    ...tableZonesQuery(location?.id ?? ''),
    enabled: location !== undefined && zoneId !== NEW_ZONE,
  });
  const zone = (zonesResult?.data ?? []).find((item) => item.id === zoneId);

  const backLink = (
    <Button variant="ghost" size="sm" asChild>
      <Link to="/locations/$slug/tables" params={{ slug }}>
        <ChevronLeft className="size-4" />
        {t('backToZones')}
      </Link>
    </Button>
  );

  if (location === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (zoneId === NEW_ZONE) {
    return (
      <>
        <PageHeading title={t('createZoneDialogTitle')} action={backLink} />
        <div className="flex flex-1 flex-col gap-6 px-4 pb-8 lg:px-6">
          <ZoneForm
            locationId={location.id}
            onCreated={(createdId) => {
              void navigate({
                to: '/locations/$slug/tables/$zoneId',
                params: { slug, zoneId: createdId },
                replace: true,
              });
            }}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeading title={zone?.name ?? t('pageTitle')} action={backLink} />
      <div className="flex flex-1 flex-col gap-6 px-4 pb-8 lg:px-6">
        {isPending ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : zone === undefined ? (
          <EmptyState
            variant="empty"
            title={t('zoneNotFoundTitle')}
            description={t('zoneNotFoundDescription')}
          />
        ) : (
          <>
            <ZoneForm locationId={location.id} zone={zone} />
            <ZoneDetail zone={zone} locationId={location.id} />
          </>
        )}
      </div>
    </>
  );
}
