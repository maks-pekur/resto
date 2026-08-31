import { createRoute } from '@tanstack/react-router';
import { Route as protectedLayoutRoute } from './_layout';
import { requirePermission } from '@/lib/auth/permissions';
import { tenantDomainsQuery } from '@/lib/queries/tenancy';
import { PageHeading } from '@/components/common/page-heading';
import { DomainsSection } from '@/components/settings/domains-section';

export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/tenant/domains',
  beforeLoad: requirePermission('settings', 'update'),
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(tenantDomainsQuery()),
  component: TenantDomainsPage,
});

function TenantDomainsPage() {
  return (
    <>
      <PageHeading title="Domains" />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <DomainsSection />
      </div>
    </>
  );
}
