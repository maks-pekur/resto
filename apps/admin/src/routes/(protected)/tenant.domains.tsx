import { createRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Route as protectedLayoutRoute } from './_layout';
import { requirePermission } from '@/lib/auth/permissions';
import { tenantDomainsQuery } from '@/lib/queries/tenancy';
import { PageHeading } from '@/components/page-heading';

export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/tenant/domains',
  beforeLoad: requirePermission('settings', 'update'),
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(tenantDomainsQuery()),
  component: TenantDomainsPage,
});

function TenantDomainsPage() {
  const { data } = useSuspenseQuery(tenantDomainsQuery());
  const domains = data.data ?? [];

  return (
    <>
      <PageHeading title="Domains" />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        {domains.length === 0 ? (
          <p className="text-muted-foreground text-sm">No custom domains configured.</p>
        ) : (
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">Domain</th>
                  <th className="px-4 py-2 text-left font-medium">Kind</th>
                  <th className="px-4 py-2 text-left font-medium">Primary</th>
                  <th className="px-4 py-2 text-left font-medium">Verified</th>
                </tr>
              </thead>
              <tbody>
                {domains.map((d) => (
                  <tr key={d.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-mono">{d.domain}</td>
                    <td className="px-4 py-2 text-muted-foreground">{d.kind}</td>
                    <td className="px-4 py-2">{d.isPrimary ? 'Yes' : '—'}</td>
                    <td className="px-4 py-2">
                      {d.verifiedAt ? new Date(d.verifiedAt).toLocaleDateString() : 'Pending'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
