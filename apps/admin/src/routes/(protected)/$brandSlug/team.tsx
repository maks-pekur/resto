import { createRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Route as brandSlugLayoutRoute } from './_layout';
import { meQuery } from '@/lib/queries/identity';
import { invitationListQuery } from '@/lib/queries/team';
import { PageHeading } from '@/components/page-heading';
import { EmptyState } from '@/components/empty-state';
import { TeamInviteButton } from '@/components/team/team-invite-button';

export const Route = createRoute({
  getParentRoute: () => brandSlugLayoutRoute,
  path: '/team',
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(meQuery()),
  component: TeamPage,
});

function TeamPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'dashboard' });
  const { data: meResult } = useSuspenseQuery(meQuery());
  const { data: invitationsResult } = useQuery(invitationListQuery());

  const me = meResult.data;
  if (me?.kind !== 'operator') return null;

  const pendingInvitations = invitationsResult ?? [];

  return (
    <>
      <PageHeading title={t('teamTitle')} action={<TeamInviteButton inviterRole={me.baseRole} />} />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        {pendingInvitations.length === 0 ? (
          <EmptyState
            variant="empty"
            title={t('teamInviteTitle')}
            description={t('teamInviteDescription')}
          />
        ) : (
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">Email</th>
                  <th className="px-4 py-2 text-left font-medium">Role</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {pendingInvitations.map((inv) => (
                  <tr key={inv.id} className="border-b last:border-0">
                    <td className="px-4 py-2">{inv.email}</td>
                    <td className="px-4 py-2 capitalize">{inv.role}</td>
                    <td className="px-4 py-2 text-muted-foreground">{inv.status}</td>
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
