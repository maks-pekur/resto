import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DangerZoneCard } from '@/components/danger-zone-card';
import { PageHeading } from '@/components/page-heading';
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
  const t = await getTranslations('dashboard');
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
      <PageHeading title={t('settingsTitle')} />
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
