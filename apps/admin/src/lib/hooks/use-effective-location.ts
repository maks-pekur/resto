import { useEffect } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Route as brandSlugLayoutRoute } from '@/routes/(protected)/$brandSlug/_layout';
import { meQuery, toOperatorSummary } from '@/lib/queries/identity';
import { meLocationsQuery, activeLocationIdQuery } from '@/lib/queries/locations';

export type EffectiveLocationMode = 'all' | 'single' | 'none';

export interface EffectiveLocation {
  readonly mode: EffectiveLocationMode;
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- 'all' documents the apiFetch({ locationId }) sentinel (D-12)
  readonly locationId: string | 'all' | undefined;
}

/**
 * D-12: the ONE location authority per role. Owner -> `?location` (URL);
 * staff -> the server session pin. Never falls back between the two.
 */
export function useEffectiveLocation(): EffectiveLocation {
  const { data: meResult } = useSuspenseQuery(meQuery());
  const operator = meResult.data ? toOperatorSummary(meResult.data) : null;
  const isOwner = operator?.baseRole === 'owner';

  const search = brandSlugLayoutRoute.useSearch();
  // `from` is for the search-updater's type narrowing only — this hook runs
  // under every brand-scoped leaf route, so the D-18 fallback redirect must
  // target the CURRENT pathname (an explicit absolute `to`), not `from`
  // re-interpolated (which would always bounce to the brand-layout's own
  // index route regardless of which page the owner was actually viewing —
  // found via the 08.5-05 browser smoke, RES-085-nav).
  const navigate = useNavigate({ from: brandSlugLayoutRoute.fullPath });
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: locationsResult } = useQuery({ ...meLocationsQuery(), enabled: isOwner });
  const { data: staffPin } = useQuery({ ...activeLocationIdQuery(), enabled: !isOwner });

  const activeLocations = [...(locationsResult?.data?.locations ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const requested = search.location;
  const matchedLocation =
    isOwner && requested !== undefined && requested !== 'all'
      ? activeLocations.find((location) => location.id === requested)
      : undefined;

  // D-03 FLAG: alphabetical-first is a mutable home view — renaming a location
  // moves the owner's default landing page. Founder chose alphabetical over a
  // stable key (created_at / primary flag); revisit if a real multi-location
  // tenant appears.
  const defaultLocation = activeLocations[0];

  // D-18: an absent/invalid/archived/foreign `?location` resets client-side to
  // the D-03 default. This is defense-in-depth only — the server (D-10) still
  // 404s an out-of-scope location regardless of what the client ever sends.
  const needsFallback =
    isOwner &&
    requested !== 'all' &&
    matchedLocation === undefined &&
    defaultLocation !== undefined;
  const fallbackLocationId = needsFallback ? defaultLocation.id : undefined;

  useEffect(() => {
    if (fallbackLocationId === undefined) return;
    void navigate({
      to: pathname,
      search: (prev) => ({ ...prev, location: fallbackLocationId }),
      replace: true,
    });
  }, [fallbackLocationId, navigate, pathname]);

  if (!isOwner) {
    return { mode: staffPin ? 'single' : 'none', locationId: staffPin ?? undefined };
  }

  if (requested === 'all') {
    return { mode: 'all', locationId: 'all' };
  }

  if (matchedLocation) {
    return { mode: 'single', locationId: matchedLocation.id };
  }

  if (defaultLocation) {
    return { mode: 'single', locationId: defaultLocation.id };
  }

  return { mode: 'none', locationId: undefined };
}
