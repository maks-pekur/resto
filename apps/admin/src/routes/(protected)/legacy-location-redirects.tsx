import { createRoute, redirect } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { Route as protectedLayoutRoute } from './_layout';
import { Route as menuLayoutRoute } from './menu/_layout';
import { resolveDefaultLocationSlug } from '@/lib/default-location';

/**
 * The addresses these pages used to live at, kept alive because live bookmarks and the browser's
 * own history are the first things a URL change breaks. Each resolves the operator's default
 * location and hands the request to the same page under its slug.
 */
const redirectToLocationPage =
  (to: '/$locationSlug/orders' | '/$locationSlug/stop-list') =>
  async ({
    context,
  }: {
    readonly context: { readonly queryClient: QueryClient };
  }): Promise<never> => {
    const locationSlug = await resolveDefaultLocationSlug(context.queryClient);
    if (locationSlug === undefined) throw redirect({ to: '/dashboard', replace: true });
    throw redirect({ to, params: { locationSlug }, replace: true });
  };

export const OrdersRedirectRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/orders',
  beforeLoad: redirectToLocationPage('/$locationSlug/orders'),
});

export const StopListRedirectRoute = createRoute({
  getParentRoute: () => menuLayoutRoute,
  path: '/stop-list',
  beforeLoad: redirectToLocationPage('/$locationSlug/stop-list'),
});
