import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';
import { PageHeading } from '@/components/page-heading';
import { apiFetch } from '@/lib/api-server';
import { TeamInviteButton } from './team-invite-button-client';

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
      <PageHeading
        title={t('teamTitle')}
        action={<TeamInviteButton inviterRole={me.data.baseRole} />}
      />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <EmptyState
          variant="empty"
          title={t('teamInviteTitle')}
          description={t('teamInviteDescription')}
        />
      </div>
    </>
  );
}
