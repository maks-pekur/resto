import type { QueryClient } from '@tanstack/react-query';
import { meLocationsQuery, type PinnableLocation } from '@/lib/queries/locations';

/**
 * D-03: alphabetical-first is the default location. It is a mutable home — renaming a location
 * moves where an owner lands — which the founder chose over a stable key; revisit if a real
 * multi-location tenant appears.
 */
export const byLocationName = (a: PinnableLocation, b: PinnableLocation): number =>
  a.name.localeCompare(b.name);

export const sortLocations = (
  locations: readonly PinnableLocation[],
): readonly PinnableLocation[] => [...locations].sort(byLocationName);

/** The slug to send someone to when a location-grain address arrives without one. */
export const resolveDefaultLocationSlug = async (
  queryClient: QueryClient,
): Promise<string | undefined> => {
  const result = await queryClient.ensureQueryData(meLocationsQuery());
  return sortLocations(result.data?.locations ?? [])[0]?.slug;
};
