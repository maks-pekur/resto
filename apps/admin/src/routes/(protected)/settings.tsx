import { createRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Route as protectedLayoutRoute } from './_layout';
import { requirePermission } from '@/lib/auth/permissions';
import { meQuery } from '@/lib/queries/identity';
import { tenancyQuery } from '@/lib/queries/tenancy';
import { PageHeading } from '@/components/page-heading';
import { DangerZoneCard } from '@/components/danger-zone-card';
import { TwoFactorSection } from '@/components/settings/two-factor-section';

export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/settings',
  beforeLoad: requirePermission('settings', 'update'),
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(meQuery()),
      queryClient.ensureQueryData(tenancyQuery()),
    ]),
  component: SettingsPage,
});

function SettingsPage() {
  const { data: meResult } = useSuspenseQuery(meQuery());
  const { data: tenantResult } = useSuspenseQuery(tenancyQuery());

  const me = meResult.data;
  const tenant = tenantResult.data;

  if (me?.kind !== 'operator' || !me.tenantId || !tenant) {
    return null;
  }

  const isOwner = me.baseRole === 'owner';

  return (
    <>
      <PageHeading title="Settings" />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <TwoFactorSection twoFactorEnabled={me.twoFactorEnabled === true} />
        <DangerZoneCard
          tenant={{
            slug: tenant.slug,
            status: tenant.status,
            offboardingScheduledAt: tenant.offboardingScheduledAt,
          }}
          isOwner={isOwner}
          userId={me.userId ?? ''}
        />
      </div>
    </>
  );
}
