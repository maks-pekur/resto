import { useState } from 'react';
import { createRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, Plus } from 'lucide-react';
import { Route as protectedLayoutRoute } from './_layout';
import { requirePermission } from '@/lib/auth/permissions';
import { meQuery } from '@/lib/queries/identity';
import {
  tenantLocationsQuery,
  archiveLocationMutation,
  restoreLocationMutation,
  friendlyLocationError,
  type LocationView,
} from '@/lib/queries/locations';
import { PageHeading } from '@/components/common/page-heading';
import { EmptyState } from '@/components/common/empty-state';
import {
  DataTable,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from '@/components/common/data-table';
import { RowActions } from '@/components/common/row-actions';
import { Button } from '@/components/ui/button';
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
  path: '/locations',
  beforeLoad: requirePermission('location', 'create'),
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(meQuery()),
      queryClient.ensureQueryData(tenantLocationsQuery()),
    ]),
  component: LocationsPage,
});

function LocationsPage() {
  const qc = useQueryClient();
  const { data: meResult } = useSuspenseQuery(meQuery());
  const { data: locationsResult, isPending } = useQuery(tenantLocationsQuery());
  const [archiveTarget, setArchiveTarget] = useState<LocationView | null>(null);

  const invalidateLocations = () => {
    void qc.invalidateQueries({ queryKey: ['locations'] });
    void qc.invalidateQueries({ queryKey: ['identity', 'me-locations'] });
  };

  const restoreMutation = useMutation({
    mutationFn: (location: LocationView) => restoreLocationMutation(location.id),
    onSuccess: (res, location) => {
      if (!res.ok) {
        toast.error(friendlyLocationError(res.status, res.data as { detail?: string } | null));
        return;
      }
      toast.success(`"${location.name}" restored.`);
      invalidateLocations();
    },
    onError: () => {
      toast.error('Something went wrong. Please try again.');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (location: LocationView) => archiveLocationMutation(location.id),
    onSuccess: (res, location) => {
      if (!res.ok) {
        toast.error(friendlyLocationError(res.status, res.data as { detail?: string } | null));
      } else {
        const count = res.data?.scopedMemberCount ?? 0;
        toast.success(
          `"${location.name}" archived. ${count.toString()} staff member${count === 1 ? '' : 's'} lost access.`,
        );
        invalidateLocations();
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
        description="Only the account owner can manage locations."
      />
    );
  }

  const locations = locationsResult?.data ?? [];

  return (
    <>
      <PageHeading
        title="Locations"
        description="Create and manage your locations."
        action={
          <Button asChild>
            <Link to="/locations/$slug" params={{ slug: 'new' }}>
              <Plus className="size-4" />
              Add new
            </Link>
          </Button>
        }
      />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        {isPending ? null : locations.length === 0 ? (
          <EmptyState
            variant="empty"
            title="No locations yet"
            description="Add your first location to start taking orders there."
          />
        ) : (
          <DataTable>
            <DataTableHead
              columns={[
                { label: 'Name' },
                { label: 'Web address' },
                { label: 'Address' },
                { label: 'Status' },
                { label: 'Actions', className: 'w-12 text-right', srOnly: true },
              ]}
            />
            <tbody>
              {locations.map((location) => (
                <DataTableRow key={location.id}>
                  <DataTableCell className="font-medium">
                    <Link
                      className="underline-offset-4 hover:underline"
                      to="/locations/$slug"
                      params={{ slug: location.slug }}
                    >
                      {location.name}
                    </Link>
                  </DataTableCell>
                  <DataTableCell className="text-muted-foreground">
                    <code>{location.slug}</code>
                  </DataTableCell>
                  <DataTableCell className="text-muted-foreground">
                    {location.address ?? '—'}
                  </DataTableCell>
                  <DataTableCell className="capitalize">{location.status}</DataTableCell>
                  <DataTableCell className="text-right">
                    <RowActions
                      label={`Actions for ${location.name}`}
                      actions={
                        location.status === 'active'
                          ? [
                              {
                                key: 'archive',
                                label: 'Archive',
                                icon: Archive,
                                tone: 'destructive' as const,
                                onSelect: () => {
                                  setArchiveTarget(location);
                                },
                              },
                            ]
                          : [
                              {
                                key: 'restore',
                                label: 'Restore',
                                icon: ArchiveRestore,
                                disabled: restoreMutation.isPending,
                                onSelect: () => {
                                  restoreMutation.mutate(location);
                                },
                              },
                            ]
                      }
                    />
                  </DataTableCell>
                </DataTableRow>
              ))}
            </tbody>
          </DataTable>
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
            <AlertDialogTitle>Archive &quot;{archiveTarget?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Staff scoped only to this location will lose access immediately. This cannot be
              undone.
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
              {archiveMutation.isPending ? 'Archiving…' : 'Archive location'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
