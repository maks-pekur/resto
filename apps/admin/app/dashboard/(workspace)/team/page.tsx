import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api-server';
import { InviteForm } from './invite-form-client';

interface MeResponse {
  kind: string;
  baseRole?: 'owner' | 'admin' | 'staff';
  tenantId?: string;
}

export default async function TeamPage() {
  const me = await apiFetch<MeResponse>('/v1/me');
  if (!me.ok || me.data?.kind !== 'operator' || !me.data.tenantId) {
    redirect('/login');
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <section className="bg-card space-y-4 rounded-lg border p-6 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">Invite a teammate</h2>
            <p className="text-muted-foreground text-sm">
              Send an email invitation. Recipient gets a link valid for 48 hours.
            </p>
          </div>
          <InviteForm inviterRole={me.data.baseRole} />
        </section>
      </div>
    </>
  );
}
