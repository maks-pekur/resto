import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { hasPermission } from '@/lib/auth/permissions';
import { meQuery } from '@/lib/queries/identity';
import { useEffectiveLocation } from '@/hooks/use-effective-location';
import { PageHeading } from '@/components/common/page-heading';
import { EmptyState } from '@/components/common/empty-state';
import { DashboardKpis } from '@/components/widgets/dashboard-kpis';
import { Button } from '@/components/ui/button';

/**
 * The one dashboard, rendered at two addresses: `/dashboard` is every location, `/{slug}/dashboard`
 * is one. Which it is comes from the path, via useEffectiveLocation — the component itself does not
 * need to know which route mounted it.
 */
export function DashboardPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'dashboard' });
  const { mode } = useEffectiveLocation();

  // Staff hold no `reports:read`; they get a plain explanation instead of a blank screen.
  const { data: meResult } = useQuery(meQuery());
  const canSeeReports = hasPermission(meResult?.data ?? null, 'reports', 'read');

  return (
    <>
      <PageHeading title={t('title')} />
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
          <DashboardKpis />
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
