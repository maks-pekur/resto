import * as Sentry from '@sentry/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { Forbidden, RouteError, RoutePending } from '@/components/route-error';
import { isForbiddenRouteError } from '@/lib/auth/permissions';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { ThemeProvider } from './components/theme-provider';
import { authClient } from './lib/auth-client';
import { apiFetch } from './lib/api-client';
import type { MeTenantsResponse } from './lib/queries/identity';
import { parseTenantSlugFromHost, adminUrlForTenant } from './lib/admin-host';
import { Route as rootRoute } from './routes/__root';
import { Route as authLayoutRoute } from './routes/(auth)/_layout';
import { Route as loginRoute } from './routes/(auth)/login';
import { Route as signupRoute } from './routes/(auth)/signup';
import { Route as forgotPasswordRoute } from './routes/(auth)/forgot-password';
import { Route as resetPasswordRoute } from './routes/(auth)/reset-password';
import { Route as acceptInvitationRoute } from './routes/(auth)/accept-invitation.$id';
import { Route as pickLocationRoute } from './routes/(auth)/pick-location';
import { Route as pickTenantRoute } from './routes/(auth)/pick-tenant';
import { Route as protectedLayoutRoute } from './routes/(protected)/_layout';
import { Route as dashboardIndexRoute } from './routes/(protected)/index';
import { Route as settingsRoute } from './routes/(protected)/settings';
import { Route as teamRoute } from './routes/(protected)/team';
import { Route as locationsRoute } from './routes/(protected)/locations';
import { Route as locationFormRoute } from './routes/(protected)/locations.$slug';
import { Route as ordersRoute } from './routes/(protected)/orders';
import { Route as rolesRoute } from './routes/(protected)/roles';
import { Route as roleDetailRoute } from './routes/(protected)/roles.$roleId';
import { Route as onboardingIndexRoute } from './routes/(protected)/onboarding/index';
import { Route as dashboardRedirectRoute } from './routes/(protected)/dashboard-redirect.$';
import { Route as menuLayoutRoute } from './routes/(protected)/menu/_layout';
import { Route as menuCategoriesRoute } from './routes/(protected)/menu/categories';
import { Route as menuItemsRoute } from './routes/(protected)/menu/items';
import { Route as menuItemDetailRoute } from './routes/(protected)/menu/items.$id';
import { Route as menuStopListRoute } from './routes/(protected)/menu/stop-list';
import { Route as menuModifierGroupsRoute } from './routes/(protected)/menu/modifier-groups';
import { Route as menuModifierGroupDetailRoute } from './routes/(protected)/menu/modifier-groups.$id';
import { Route as tenantDomainsRoute } from './routes/(protected)/tenant.domains';
import { Route as tenantThemeRoute } from './routes/(protected)/tenant.theme';
import { Route as tenantPayoutsRoute } from './routes/(protected)/tenant.payouts';
import '@resto/config-tailwind/tokens.css';
import './styles.css';

// G-04: init Sentry before the React tree mounts so unhandled errors are captured.
// No-op when VITE_SENTRY_DSN is absent — dev builds without the var are unaffected.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    integrations: [Sentry.browserTracingIntegration()],
  });
}

const authRouteTree = authLayoutRoute.addChildren([
  loginRoute,
  signupRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  acceptInvitationRoute,
  pickLocationRoute,
  pickTenantRoute,
]);

const menuRouteTree = menuLayoutRoute.addChildren([
  menuCategoriesRoute,
  menuItemsRoute,
  menuItemDetailRoute,
  menuStopListRoute,
  menuModifierGroupsRoute,
  menuModifierGroupDetailRoute,
]);

const protectedRouteTree = protectedLayoutRoute.addChildren([
  dashboardIndexRoute,
  settingsRoute,
  teamRoute,
  rolesRoute,
  roleDetailRoute,
  locationsRoute,
  locationFormRoute,
  ordersRoute,
  menuRouteTree,
  tenantDomainsRoute,
  tenantThemeRoute,
  tenantPayoutsRoute,
  onboardingIndexRoute,
  dashboardRedirectRoute,
]);

const routeTree = rootRoute.addChildren([authRouteTree, protectedRouteTree]);

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultErrorComponent: ({ error, reset }) =>
    isForbiddenRouteError(error) ? <Forbidden /> : <RouteError reset={reset} />,
  defaultPendingComponent: RoutePending,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// D-21: the single bootstrap host-vs-session reconciliation check. Runs once,
// here only — not in a route file. The apex host (no tenant slug) is where
// sign-in/signup live and is intentionally left alone; a session with no
// bound tenant yet is also left alone (route guards handle that case).
async function reconcileHostWithSession(): Promise<void> {
  const hostSlug = parseTenantSlugFromHost(window.location.hostname);
  if (hostSlug === null) return;
  const session = await authClient.getSession();
  const sessionData =
    session.data !== null
      ? (session.data as { session?: { activeOrganizationId?: string } }).session
      : undefined;
  const boundTenantId = sessionData?.activeOrganizationId;
  if (boundTenantId === undefined) return;
  const tenantsRes = await apiFetch<MeTenantsResponse>('/v1/me/tenants');
  const boundTenant = tenantsRes.data?.tenants.find((tenant) => tenant.id === boundTenantId);
  if (!boundTenant || boundTenant.slug === hostSlug) return;
  window.location.replace(
    adminUrlForTenant(boundTenant.slug, `${window.location.pathname}${window.location.search}`),
  );
}

void reconcileHostWithSession();

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found.');

createRoot(container).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} context={{ queryClient }} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
