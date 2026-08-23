import { useState } from 'react';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { Route as authLayoutRoute } from './_layout';
import { apiFetch } from '@/lib/api-client';
import { meLocationsQuery } from '@/lib/queries/locations';
import { safeNext } from '@/lib/auth/safe-next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const SearchSchema = z.object({
  next: z.string().optional(),
});

export const Route = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/pick-location',
  validateSearch: SearchSchema,
  component: PickLocationPage,
});

function PickLocationPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const { data: locationsResult, isPending } = useQuery(meLocationsQuery());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const locations = locationsResult?.data?.locations ?? [];

  const pick = async (locationId: string) => {
    setPendingId(locationId);
    setError(null);
    const res = await apiFetch<{ locationId: string | null }>('/v1/me/set-active-location', {
      method: 'POST',
      body: { locationId },
    });
    if (!res.ok) {
      setError('Could not select this location. Please try again.');
      setPendingId(null);
      return;
    }
    void navigate({ to: safeNext(next ?? '/dashboard') });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Choose your location</CardTitle>
        <CardDescription>
          You are scoped to more than one location. Pick one to continue.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {isPending ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : locations.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No locations available. Contact your owner.
          </p>
        ) : (
          locations.map((location) => (
            <Button
              key={location.id}
              variant="outline"
              className="justify-start"
              disabled={pendingId !== null}
              onClick={() => void pick(location.id)}
            >
              {pendingId === location.id ? 'Entering…' : location.name}
            </Button>
          ))
        )}
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
