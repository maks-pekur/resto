import { useState } from 'react';
import { createRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, Plus } from 'lucide-react';
import { Route as protectedLayoutRoute } from './_layout';
import { meQuery } from '@/lib/queries/identity';
import {
  tenantLocationsQuery,
  archiveLocationMutation,
  friendlyLocationError,
  type LocationView,
} from '@/lib/queries/locations';
import { PageHeading } from '@/components/page-heading';
import { EmptyState } from '@/components/empty-state';
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
      <PageHeading title="Locations" description="Create and manage your locations." />
      <div className="flex justify-end px-4 lg:px-6">
        <Button asChild>
          <Link to="/locations/$slug" params={{ slug: 'new' }}>
            <Plus className="size-4" />
            Add new
          </Link>
        </Button>
      </div>
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        {isPending ? null : locations.length === 0 ? (
          <EmptyState
            variant="empty"
            title="No locations yet"
            description="Add your first location to start taking orders there."
          />
        ) : (
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    Name
                  </th>
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    Web address
                  </th>
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    Address
                  </th>
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {locations.map((location) => (
                  <tr key={location.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">
                      <Link
                        className="underline-offset-4 hover:underline"
                        to="/locations/$slug"
                        params={{ slug: location.slug }}
                      >
                        {location.name}
                      </Link>
                    </td>
                    <td className="text-muted-foreground px-4 py-2">
                      <code>{location.slug}</code>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{location.address ?? '—'}</td>
                    <td className="px-4 py-2 capitalize">{location.status}</td>
                    <td className="px-4 py-2">
                      {location.status === 'active' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Archive ${location.name}`}
                          onClick={() => {
                            setArchiveTarget(location);
                          }}
                        >
                          <Archive className="size-4" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
