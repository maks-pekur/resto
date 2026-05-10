import { redirect } from 'next/navigation';
import { TenantBreadcrumb } from '@/components/tenant-breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { DangerZoneCard } from '@/components/danger-zone-card';
import { apiFetch } from '@/lib/api-server';

interface MeResponse {
  kind: string;
  baseRole?: 'owner' | 'admin' | 'staff';
  tenantId?: string;
}

interface TenantResponse {
  id: string;
  slug: string;
  status: string;
  offboardingScheduledAt: string | null;
}

export default async function SettingsPage() {
  const me = await apiFetch<MeResponse>('/v1/me');
  if (!me.ok || me.data?.kind !== 'operator' || !me.data.tenantId) {
    redirect('/login');
  }
  const tenant = await apiFetch<TenantResponse>('/v1/tenants/me');
  if (!tenant.ok || !tenant.data) {
    redirect('/login');
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <TenantBreadcrumb trail="Settings" />
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <DangerZoneCard
          tenant={{
            slug: tenant.data.slug,
            status: tenant.data.status,
            offboardingScheduledAt: tenant.data.offboardingScheduledAt,
          }}
          isOwner={me.data.baseRole === 'owner'}
        />
      </div>
    </>
  );
}
