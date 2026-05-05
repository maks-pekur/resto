import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { apiFetch } from '@/lib/api-server';

interface TenantSummary {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
}

const fetchTenant = async (): Promise<TenantSummary | null> => {
  const res = await apiFetch<TenantSummary>('/v1/tenants/me');
  return res.ok ? res.data : null;
};

/**
 * Server component. Fetches the operator's active tenant on the server
 * with the request's BA cookie forwarded — the dashboard renders with
 * the displayName already populated, no skeleton, no FOUC.
 */
export async function TenantBreadcrumb({ trail }: { readonly trail: string }) {
  const tenant = await fetchTenant();

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden md:block">
          <span className="font-medium" data-testid="tenant-display-name">
            {tenant?.displayName ?? 'Unknown tenant'}
          </span>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden md:block" />
        <BreadcrumbItem>
          <BreadcrumbPage>{trail}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
