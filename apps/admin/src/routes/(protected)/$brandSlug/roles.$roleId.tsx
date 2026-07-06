import { createRoute } from '@tanstack/react-router';
import { useSuspenseQuery, useQuery } from '@tanstack/react-query';
import { Route as brandSlugLayoutRoute } from './_layout';
import { meQuery } from '@/lib/queries/identity';
import { rolesQuery, roleQuery, roleMembersQuery } from '@/lib/queries/roles';
import { PageHeading } from '@/components/page-heading';
import { EmptyState } from '@/components/empty-state';
import { RoleForm } from '@/components/roles/role-form';

export const Route = createRoute({
  getParentRoute: () => brandSlugLayoutRoute,
  path: '/roles/$roleId',
  loader: ({ context: { queryClient }, params: { roleId } }) => {
    const loaders: Promise<unknown>[] = [
      queryClient.ensureQueryData(meQuery()),
      queryClient.ensureQueryData(rolesQuery()),
    ];
    if (roleId !== 'new') {
      loaders.push(queryClient.ensureQueryData(roleQuery(roleId)));
      loaders.push(queryClient.ensureQueryData(roleMembersQuery()));
    }
    return Promise.all(loaders);
  },
  component: RoleDetailPage,
});

function RoleDetailPage() {
  const { brandSlug, roleId } = Route.useParams();
  const { data: meResult } = useSuspenseQuery(meQuery());
  const { data: membersResult } = useQuery({
    ...roleMembersQuery(),
    enabled: roleId !== 'new',
  });
  const { data: roleResult } = useQuery({
    ...roleQuery(roleId),
    enabled: roleId !== 'new',
  });

  const me = meResult.data;
  if (me?.kind !== 'operator') return null;

  const isOwner = me.baseRole === 'owner';

  if (!isOwner) {
    return (
      <EmptyState
        variant="forbidden"
        title="Owner access required"
        description="Only the account owner can manage roles."
      />
    );
  }

  const isNew = roleId === 'new';
  const existingRole = isNew ? undefined : (roleResult?.data ?? undefined);

  const members = membersResult?.data?.members ?? [];
  const memberCount = isNew
    ? 0
    : members.filter((m) => m.role === (existingRole?.role ?? roleId)).length;

  const pageTitle = isNew ? 'New role' : (existingRole?.role ?? roleId);

  return (
    <>
      <PageHeading title={pageTitle} />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <RoleForm
          brandSlug={brandSlug}
          isNew={isNew}
          existingRole={existingRole}
          memberCount={memberCount}
        />
      </div>
    </>
  );
}
