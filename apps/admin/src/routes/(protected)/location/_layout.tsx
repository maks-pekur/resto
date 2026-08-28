import { createRoute, Outlet, redirect } from '@tanstack/react-router';
import { Route as protectedLayoutRoute } from '../_layout';
import { meLocationsQuery } from '@/lib/queries/locations';
import { resolveLocationRoute } from '@/lib/location-path';

/**
 * `/{locationSlug}/…` — the pages whose content is meaningless without knowing which point.
 *
 * It matches any first segment, so every static root route must be reserved against location slugs
 * (LOCATION_RESERVED_SLUGS, derived from ADMIN_ROOT_ROUTE_SEGMENTS) or a location could shadow a
 * real page. `reserved-slugs-route-derivation.spec.ts` is what keeps that honest.
 *
 * The slug is resolved once, here, and handed to the children as route context — so a child's
 * loader never has to look it up again, and never has to handle it being wrong.
 */
export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/$locationSlug',
  beforeLoad: async ({ context, params, location }) => {
    const result = await context.queryClient.ensureQueryData(meLocationsQuery());
    const resolution = resolveLocationRoute(
      result.data?.locations ?? [],
      params.locationSlug,
      location.pathname,
    );

    if (resolution.kind === 'resolved') return { activeLocation: resolution.location };
    if (resolution.kind === 'no-locations') throw redirect({ to: '/dashboard', replace: true });
    // `href` rather than `to`: the sub-path is whatever page they asked for, so there is no single
    // typed route to name here.
    throw redirect({ href: resolution.href, replace: true });
  },
  component: () => <Outlet />,
});
