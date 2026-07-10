import { useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import { useSuspenseQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Archive } from 'lucide-react';
import { Route as brandSlugLayoutRoute } from './_layout';
import { meQuery } from '@/lib/queries/identity';
import {
  brandLocationsQuery,
  createLocationMutation,
  archiveLocationMutation,
  friendlyLocationError,
  type LocationView,
} from '@/lib/queries/locations';
import { PageHeading } from '@/components/page-heading';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

const CreateLocationSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(200),
  address: z.string().trim().max(500).optional().or(z.literal('')),
  timezone: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z_]+\/[A-Za-z_]+$/, 'Use an IANA timezone identifier (e.g. Europe/Moscow)')
    .optional()
    .or(z.literal('')),
  phone: z.string().trim().max(32).optional().or(z.literal('')),
  email: z.string().trim().max(255).email('Invalid email').optional().or(z.literal('')),
});
type CreateLocationForm = z.infer<typeof CreateLocationSchema>;

export const Route = createRoute({
  getParentRoute: () => brandSlugLayoutRoute,
  path: '/locations',
  loader: ({ context: { queryClient }, params: { brandSlug } }) =>
    Promise.all([
      queryClient.ensureQueryData(meQuery()),
      queryClient.ensureQueryData(brandLocationsQuery(brandSlug)),
    ]),
  component: LocationsPage,
});

function LocationsPage() {
  const { brandSlug } = Route.useParams();
  const qc = useQueryClient();
  const { data: meResult } = useSuspenseQuery(meQuery());
  const { data: locationsResult, isPending } = useQuery(brandLocationsQuery(brandSlug));
  const [archiveTarget, setArchiveTarget] = useState<LocationView | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateLocationForm>({ resolver: zodResolver(CreateLocationSchema) });

  const invalidateLocations = () => {
    void qc.invalidateQueries({ queryKey: ['locations', brandSlug] });
    void qc.invalidateQueries({ queryKey: ['identity', 'me-locations'] });
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateLocationForm) =>
      createLocationMutation(brandSlug, {
        name: data.name,
        address: data.address && data.address.length > 0 ? data.address : null,
        timezone: data.timezone && data.timezone.length > 0 ? data.timezone : null,
        contacts:
          data.phone || data.email
            ? {
                ...(data.phone ? { phone: data.phone } : {}),
                ...(data.email ? { email: data.email } : {}),
              }
            : null,
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(friendlyLocationError(res.status, res.data as { detail?: string } | null));
        return;
      }
      toast.success('Location created.');
      reset();
      invalidateLocations();
    },
    onError: () => toast.error('Something went wrong. Please try again.'),
  });

  const archiveMutation = useMutation({
    mutationFn: (location: LocationView) => archiveLocationMutation(brandSlug, location.id),
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
      <PageHeading title="Locations" description="Create and manage this brand's locations." />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>New location</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                void handleSubmit((data) => {
                  createMutation.mutate(data);
                })(e);
              }}
              className="grid gap-4 sm:grid-cols-2"
              noValidate
            >
              <div className="grid gap-1.5">
                <Label htmlFor="location-name">Name</Label>
                <Input id="location-name" {...register('name')} />
                {errors.name ? (
                  <p className="text-destructive text-sm">{errors.name.message}</p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="location-address">Address</Label>
                <Input id="location-address" {...register('address')} />
                {errors.address ? (
                  <p className="text-destructive text-sm">{errors.address.message}</p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="location-timezone">Timezone</Label>
                <Input
                  id="location-timezone"
                  placeholder="Europe/Moscow"
                  {...register('timezone')}
                />
                {errors.timezone ? (
                  <p className="text-destructive text-sm">{errors.timezone.message}</p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="location-phone">Phone</Label>
                <Input id="location-phone" {...register('phone')} />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="location-email">Contact email</Label>
                <Input id="location-email" type="email" {...register('email')} />
                {errors.email ? (
                  <p className="text-destructive text-sm">{errors.email.message}</p>
                ) : null}
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={isSubmitting || createMutation.isPending}>
                  {createMutation.isPending ? 'Creating…' : 'Create location'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {isPending ? null : locations.length === 0 ? (
          <EmptyState
            variant="empty"
            title="No locations yet"
            description="Create the first location above."
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
                    <td className="px-4 py-2 font-medium">{location.name}</td>
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
