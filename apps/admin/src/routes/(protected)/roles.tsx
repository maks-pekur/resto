import { createRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useSuspenseQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Route as protectedLayoutRoute } from './_layout';
import { requirePermission } from '@/lib/auth/permissions';
import { meQuery } from '@/lib/queries/identity';
import { rolesQuery, archiveRole, friendlyRoleError, type RoleView } from '@/lib/queries/roles';
import { PageHeading } from '@/components/common/page-heading';
import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';
import { RoleList, RoleListSkeleton } from '@/components/roles/role-list';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/roles',
  beforeLoad: requirePermission('ac', 'read'),
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(meQuery()),
      queryClient.ensureQueryData(rolesQuery()),
    ]),
  component: RolesPage,
});

function RolesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: meResult } = useSuspenseQuery(meQuery());
  const { data: rolesResult, isPending } = useQuery(rolesQuery());

  const [archiveTarget, setArchiveTarget] = useState<RoleView | null>(null);

  const archiveMutation = useMutation({
    mutationFn: (role: RoleView) => archiveRole(role.role),
    onSuccess: (res, role) => {
      if (!res.ok) {
        toast.error(friendlyRoleError(res.status, res.data as Record<string, string> | null));
      } else {
        toast.success(`Role "${role.role}" archived.`);
        void qc.invalidateQueries({ queryKey: ['roles'] });
      }
      setArchiveTarget(null);
    },
    onError: () => {
      toast.error('Something went wrong. Please try again.');
      setArchiveTarget(null);
    },
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

  const roles = rolesResult?.data?.roles ?? [];

  return (
    <>
      <PageHeading
        title="Roles"
        description="Create custom roles and assign them to team members."
        action={
          <Button
            size="sm"
            onClick={() => {
              void navigate({
                to: '/roles/$roleId',
                params: { roleId: 'new' },
              });
            }}
          >
            Create role
          </Button>
        }
      />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        {isPending ? (
          <RoleListSkeleton />
        ) : roles.length === 0 ? (
          <EmptyState
            variant="empty"
            title="No custom roles yet"
            description="Start from a preset — duplicate a built-in role and adjust its permissions to match the job."
            action={
              <Button
                size="sm"
                onClick={() => {
                  void navigate({
                    to: '/roles/$roleId',
                    params: { roleId: 'new' },
                  });
                }}
              >
                Create role
              </Button>
            }
          />
        ) : (
          <RoleList
            roles={roles}
            onArchive={(role) => {
              setArchiveTarget(role);
            }}
          />
        )}
      </div>

      <AlertDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive &quot;{archiveTarget?.role}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Archived roles cannot be assigned to new members. Members currently on this role must
              already be reassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={archiveMutation.isPending}
              onClick={() => {
                if (archiveTarget) archiveMutation.mutate(archiveTarget);
              }}
            >
              {archiveMutation.isPending ? 'Archiving…' : 'Archive role'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
