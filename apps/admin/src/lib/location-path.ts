import type { PinnableLocation } from '@/lib/queries/locations';
import { sortLocations } from '@/lib/default-location';

/** The only page with an every-location view, and so the only sub-path that survives without a slug. */
export const ALL_LOCATIONS_SUB_PATH = '/dashboard';

export type LocationRouteResolution =
  | { readonly kind: 'resolved'; readonly location: PinnableLocation }
  | { readonly kind: 'redirect'; readonly href: string }
  | { readonly kind: 'no-locations' };

/**
 * What `/{locationSlug}/…` should do with the slug it was given.
 *
 * A slug the operator cannot reach — unknown, archived, or another member's point, since
 * `/v1/me/locations` only ever returns what they hold — sends them to the same page under their
 * default location rather than to the dashboard. Losing the page as well as the location turns a
 * mistyped address into "where did my screen go".
 */
export const resolveLocationRoute = (
  locations: readonly PinnableLocation[],
  requestedSlug: string,
  pathname: string,
): LocationRouteResolution => {
  const match = locations.find((candidate) => candidate.slug === requestedSlug);
  if (match) return { kind: 'resolved', location: match };

  const fallback = sortLocations(locations)[0];
  if (!fallback) return { kind: 'no-locations' };

  const subPath = pathname.slice(`/${requestedSlug}`.length);
  return { kind: 'redirect', href: `/${fallback.slug}${subPath || ALL_LOCATIONS_SUB_PATH}` };
};

/**
 * The part of the address that stays put while the location changes: `/voskresenka/orders` and
 * `/podil/orders` differ only in the slug. On a slugless address there is nothing to preserve —
 * only the dashboard has one — so the switcher lands on the dashboard.
 */
export const locationSubPath = (pathname: string, currentSlug: string | undefined): string =>
  currentSlug === undefined ? ALL_LOCATIONS_SUB_PATH : pathname.slice(`/${currentSlug}`.length);

/** Where the switcher goes. `null` means the every-location view. */
export const locationHref = (nextSlug: string | null, subPath: string): string =>
  nextSlug === null ? subPath : `/${nextSlug}${subPath}`;
