import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { hasPermission } from '@/lib/auth/permissions';
import { meQuery } from '@/lib/queries/identity';
import { meLocationsQuery } from '@/lib/queries/locations';
import { sortLocations } from '@/lib/default-location';
import { useEffectiveLocation } from '@/hooks/use-effective-location';
import { DEFAULT_DASHBOARD_RANGE, type DateRange } from '@/lib/date-range';
import { EmptyState } from '@/components/common/empty-state';
import { ALL_LOCATIONS, LocationsFilter } from '@/components/common/locations-filter';
import { DateRangePicker } from '@/components/common/date-range-picker';
import { DashboardKpis } from '@/components/widgets/dashboard-kpis';
import { Button } from '@/components/ui/button';

/**
 * The one dashboard, rendered at two addresses: `/dashboard` is every location, `/{slug}/dashboard`
 * is one. Which it is comes from the path, via useEffectiveLocation — the component itself does not
 * need to know which route mounted it.
 */
export function DashboardPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'dashboard' });
  const { mode, locationId } = useEffectiveLocation();

  // Staff hold no `reports:read`; they get a plain explanation instead of a blank screen.
  const { data: meResult } = useQuery(meQuery());
  const canSeeReports = hasPermission(meResult?.data ?? null, 'reports', 'read');

  const { data: locationsResult } = useQuery(meLocationsQuery());
  const locations = sortLocations(locationsResult?.data?.locations ?? []);

  const [range, setRange] = useState<DateRange>(() => DEFAULT_DASHBOARD_RANGE());
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const effectiveLocation = selectedLocation ?? (mode === 'single' ? locationId : null);
  const filterValue = effectiveLocation ?? ALL_LOCATIONS;

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        {mode === 'none' ? (
          // D-19: zero active locations (owner) — empty state + create-location CTA, no
          // default-location redirect.
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
        ) : canSeeReports ? (
          <>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <LocationsFilter
                locations={locations.map((location) => ({
                  id: location.id,
                  name: location.name,
                }))}
                value={filterValue}
                onChange={setSelectedLocation}
              />
              <DateRangePicker value={range} onChange={setRange} />
            </div>
            <DashboardKpis locationId={filterValue} range={range} />
          </>
        ) : (
          <EmptyState
            variant="empty"
            title={t('noReportsTitle')}
            description={t('noReportsDescription')}
          />
        )}
      </div>
    </>
  );
}
