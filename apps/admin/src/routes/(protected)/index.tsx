import { createRoute, redirect } from '@tanstack/react-router';
import { Route as protectedLayoutRoute } from './_layout';

/**
 * The landing address. The dashboard got its own path when the location moved into the first
 * segment — `/` would otherwise be the only page whose grain you could not read off its address.
 */
export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/dashboard', replace: true });
  },
});
