import { redirect } from 'next/navigation';
import { TenantBreadcrumb } from '@/components/tenant-breadcrumb';
import { DangerZoneCard } from '@/components/danger-zone-card';
import { apiFetch } from '@/lib/api-server';
import { TwoFactorSection } from './two-factor-enable-client';

interface MeResponse {
  kind: string;
  baseRole?: 'owner' | 'admin' | 'staff';
  tenantId?: string;
  twoFactorEnabled?: boolean;
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
      <div className="px-4 lg:px-6">
        <TenantBreadcrumb trail="Settings" />
      </div>
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <TwoFactorSection twoFactorEnabled={me.data.twoFactorEnabled === true} />
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
