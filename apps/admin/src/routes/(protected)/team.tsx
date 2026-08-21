import { createRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Route as protectedLayoutRoute } from './_layout';
import { meQuery } from '@/lib/queries/identity';
import { invitationListQuery } from '@/lib/queries/team';
import { roleMembersQuery, rolesQuery } from '@/lib/queries/roles';
import { tenantLocationsQuery } from '@/lib/queries/locations';
import { PageHeading } from '@/components/page-heading';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { TeamInviteButton } from '@/components/team/team-invite-button';
import { MemberLocationRoleMatrix } from '@/components/team/member-location-role-matrix';

export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/team',
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(meQuery()),
      queryClient.ensureQueryData(roleMembersQuery()),
      queryClient.ensureQueryData(rolesQuery()),
      queryClient.ensureQueryData(tenantLocationsQuery()),
    ]),
  component: TeamPage,
});

function TeamPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'dashboard' });
  const { data: meResult } = useSuspenseQuery(meQuery());
  const { data: invitationsResult } = useQuery(invitationListQuery());
  const { data: membersResult } = useQuery(roleMembersQuery());
  const { data: rolesResult } = useQuery(rolesQuery());
  const { data: locationsResult } = useQuery(tenantLocationsQuery());

  const me = meResult.data;
  if (me?.kind !== 'operator') return null;

  const isOwner = me.baseRole === 'owner';
  const pendingInvitations = invitationsResult ?? [];
  const activeMembers = membersResult?.data?.members ?? [];
  const customRoles = (rolesResult?.data?.roles ?? []).filter(
    (r) => r.system !== true && !['owner', 'admin', 'staff'].includes(r.role),
  );
  const locations = (locationsResult?.data ?? []).filter((l) => l.status === 'active');

  return (
    <>
      <PageHeading title={t('teamTitle')} action={<TeamInviteButton inviterRole={me.baseRole} />} />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        {activeMembers.length > 0 && (
          <>
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th scope="col" className="px-4 py-2 text-left font-medium">
                      Member
                    </th>
                    <th scope="col" className="px-4 py-2 text-left font-medium">
                      Base role
                    </th>
                    {isOwner && (
                      <th scope="col" className="px-4 py-2 text-left font-medium">
                        Location roles
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {activeMembers.map((member) => (
                    <tr key={member.id} className="border-b last:border-0">
                      <td className="px-4 py-2 text-sm">{member.email}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline">{member.role}</Badge>
                      </td>
                      {isOwner && (
                        <td className="px-4 py-2">
                          <MemberLocationRoleMatrix
                            member={member}
                            isOwner={isOwner}
                            availableRoles={customRoles}
                            locations={locations}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground text-xs">
              Roles are assigned per location, not tenant-wide. A member&apos;s access is derived
              from the locations they are scoped to — there is no separate tenant-scope setting.
            </p>
          </>
        )}

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
