import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeading } from '@/components/page-heading';
import { apiFetch } from '@/lib/api-server';
import { InviteForm } from './invite-form-client';

interface MeResponse {
  kind: string;
  baseRole?: 'owner' | 'admin' | 'staff';
  tenantId?: string;
}

export default async function TeamPage() {
  const t = await getTranslations('dashboard');
  const me = await apiFetch<MeResponse>('/v1/me');
  if (!me.ok || me.data?.kind !== 'operator' || !me.data.tenantId) {
    redirect('/login');
  }

  return (
    <>
      <PageHeading title={t('teamTitle')} />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <section className="bg-card space-y-4 rounded-lg border p-6 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">{t('teamInviteTitle')}</h2>
            <p className="text-muted-foreground text-sm">{t('teamInviteDescription')}</p>
          </div>
          <InviteForm inviterRole={me.data.baseRole} />
        </section>
      </div>
    </>
  );
}
