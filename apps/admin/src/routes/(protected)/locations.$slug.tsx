import { useEffect, useState } from 'react';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { slugifyName } from '@resto/domain';
import { Route as protectedLayoutRoute } from './_layout';
import {
  createLocationMutation,
  tenantLocationsQuery,
  updateLocationMutation,
} from '@/lib/queries/locations';
import { PageHeading } from '@/components/page-heading';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LocationPointPicker, type Point } from '@/components/locations/location-point-picker';

const FormSchema = z.object({
  name: z.string().trim().min(1, 'Give the location a name').max(200),
  address: z.string().trim().min(1, 'An address is required'),
  timezone: z.string().trim().optional(),
  phone: z.string().trim().max(32).optional(),
  email: z.union([z.string().trim().email(), z.literal('')]).optional(),
});
type FormValues = z.infer<typeof FormSchema>;

export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/locations/$slug',
  component: LocationFormPage,
});

function LocationFormPage() {
  const { slug } = Route.useParams();
  const isNew = slug === 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [point, setPoint] = useState<Point | null>(null);

  const { data: locationsResult, isPending } = useQuery(tenantLocationsQuery());
  const existing = (locationsResult?.data ?? []).find((location) => location.slug === slug);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(FormSchema) });

  // Edit mode fills the form once the list arrives; create mode leaves it blank. This is the whole
  // reason `new` is a slug that cannot exist — the lookup simply misses and there is no initial value.
  useEffect(() => {
    if (!existing) return;
    reset({
      name: existing.name,
      address: existing.address ?? '',
      timezone: existing.timezone ?? '',
      phone: existing.contacts?.phone ?? '',
      email: existing.contacts?.email ?? '',
    });
    if (existing.latitude !== null && existing.longitude !== null) {
      setPoint({ latitude: existing.latitude, longitude: existing.longitude });
    }
  }, [existing, reset]);

  const nameValue = watch('name');
  const previewSlug = isNew ? slugifyName(nameValue) : existing?.slug;

  const save = useMutation({
    mutationFn: async (data: FormValues) => {
      if (!point) throw new Error('point required');
      const contacts =
        data.phone || data.email
          ? {
              ...(data.phone ? { phone: data.phone } : {}),
              ...(data.email ? { email: data.email } : {}),
            }
          : null;
      const payload = {
        name: data.name,
        address: data.address,
        latitude: point.latitude,
        longitude: point.longitude,
        ...(data.timezone ? { timezone: data.timezone } : {}),
        contacts,
      };
      return isNew
        ? createLocationMutation(payload)
        : updateLocationMutation(existing?.id ?? '', payload);
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error('Could not save the location. Check the fields and try again.');
        return;
      }
      void qc.invalidateQueries({ queryKey: ['locations'] });
      toast.success(isNew ? 'Location created.' : 'Location saved.');
      void navigate({ to: '/locations' });
    },
    onError: () => {
      toast.error('Could not save the location.');
    },
  });

  if (!isNew && isPending) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (!isNew && !existing) {
    return (
      <EmptyState
        variant="empty"
        title="No such location"
        description="It may have been archived, or the address in the URL is out of date."
        action={
          <Button
            onClick={() => {
              void navigate({ to: '/locations' });
            }}
          >
            Back to locations
          </Button>
        }
      />
    );
  }

  return (
    <>
      <PageHeading
        title={isNew ? 'New location' : (existing?.name ?? 'Location')}
        description={
          isNew
            ? 'Name it after the district or street people use — "Воскресенка", "Podil", "High Street".'
            : 'The web address of a location never changes, even when its name does.'
        }
      />
      <div className="flex flex-1 flex-col gap-4 px-4 pb-8 lg:px-6">
        <form
          onSubmit={(e) => {
            void handleSubmit((data) => {
              if (!point) {
                toast.error('Pick the exact point on the map first.');
                return;
              }
              save.mutate(data);
            })(e);
          }}
          className="grid gap-4"
          noValidate
        >
          <Card>
            <CardHeader>
              <CardTitle>Name and address</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="loc-name">Name</Label>
                <Input id="loc-name" placeholder="Воскресенка" {...register('name')} />
                {errors.name ? (
                  <p className="text-destructive text-sm">{errors.name.message}</p>
                ) : null}
                {previewSlug ? (
                  <p className="text-muted-foreground text-xs">
                    Web address: <code>?location={previewSlug}</code>
                    {isNew ? '' : ' — fixed after creation'}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="loc-address">Address</Label>
                <Input id="loc-address" {...register('address')} />
                {errors.address ? (
                  <p className="text-destructive text-sm">{errors.address.message}</p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Exact point</CardTitle>
            </CardHeader>
            <CardContent>
              <LocationPointPicker
                value={point}
                addressHint={watch('address')}
                onChange={(next) => {
                  setPoint(next);
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Optional details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="loc-phone">Phone</Label>
                <Input id="loc-phone" {...register('phone')} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="loc-email">Email</Label>
                <Input id="loc-email" type="email" {...register('email')} />
                {errors.email ? (
                  <p className="text-destructive text-sm">{errors.email.message}</p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="loc-tz">Timezone</Label>
                <Input
                  id="loc-tz"
                  placeholder="Inherited from the restaurant"
                  {...register('timezone')}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting || save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {isNew ? 'Create location' : 'Save changes'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void navigate({ to: '/locations' });
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
