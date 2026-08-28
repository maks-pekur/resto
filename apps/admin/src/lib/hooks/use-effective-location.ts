import { useParams } from '@tanstack/react-router';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { meQuery, toOperatorSummary } from '@/lib/queries/identity';
import { meLocationsQuery, activeLocationIdQuery } from '@/lib/queries/locations';
import { sortLocations } from '@/lib/default-location';

export type EffectiveLocationMode = 'all' | 'single' | 'none';

export interface EffectiveLocation {
  readonly mode: EffectiveLocationMode;
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- 'all' documents the apiFetch({ locationId }) sentinel (D-12)
  readonly locationId: string | 'all' | undefined;
  readonly locationSlug: string | undefined;
}

const NO_LOCATION: EffectiveLocation = {
  mode: 'none',
  locationId: undefined,
  locationSlug: undefined,
};

/**
 * D-12: the ONE location authority per role. Owner -> the `$locationSlug` path segment; staff ->
 * the server session pin. Never falls back between the two.
 *
 * The owner's carrier moved out of `?location=` and into the path, so this hook no longer redirects
 * anything: an address that names no location simply *is* the every-location view, and an address
 * that names an unreachable one is corrected by the `/$locationSlug` layout before any page renders.
 */
export function useEffectiveLocation(): EffectiveLocation {
  const { data: meResult } = useSuspenseQuery(meQuery());
  const operator = meResult.data ? toOperatorSummary(meResult.data) : null;
  const isOwner = operator?.baseRole === 'owner';

  // `strict: false` because this hook runs under every protected route, most of which have no
  // location in their address at all.
  const params = useParams({ strict: false });

  const { data: locationsResult } = useQuery(meLocationsQuery());
  const { data: staffPin } = useQuery({ ...activeLocationIdQuery(), enabled: !isOwner });

  const locations = sortLocations(locationsResult?.data?.locations ?? []);

  if (!isOwner) {
    if (!staffPin) return NO_LOCATION;
    // The pin decides even when the list is unavailable — a role without `location: read` cannot
    // read `/v1/me/locations`, and losing the slug must not lose the location itself.
    const pinned = locations.find((candidate) => candidate.id === staffPin);
    return { mode: 'single', locationId: staffPin, locationSlug: pinned?.slug };
  }

  const matched =
    params.locationSlug !== undefined
      ? locations.find((candidate) => candidate.slug === params.locationSlug)
      : undefined;
  if (matched) return { mode: 'single', locationId: matched.id, locationSlug: matched.slug };

  if (locations.length === 0) return NO_LOCATION;

  // D-19/D-17: no slug in the address is the every-location view, not a missing selection.
  return { mode: 'all', locationId: 'all', locationSlug: undefined };
}
