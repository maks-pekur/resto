import * as Sentry from '@sentry/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { Route as rootRoute } from './routes/__root';
import { Route as indexRoute } from './routes/index';
import { Route as authLayoutRoute } from './routes/(auth)/_layout';
import { Route as loginRoute } from './routes/(auth)/login';
import { Route as signupRoute } from './routes/(auth)/signup';
import { Route as forgotPasswordRoute } from './routes/(auth)/forgot-password';
import { Route as resetPasswordRoute } from './routes/(auth)/reset-password';
import { Route as acceptInvitationRoute } from './routes/(auth)/accept-invitation.$id';
import { Route as protectedLayoutRoute } from './routes/(protected)/_layout';
import { Route as brandSlugLayoutRoute } from './routes/(protected)/$brandSlug/_layout';
import { Route as brandSlugIndexRoute } from './routes/(protected)/$brandSlug/index';
import { Route as settingsRoute } from './routes/(protected)/$brandSlug/settings';
import { Route as teamRoute } from './routes/(protected)/$brandSlug/team';
import { Route as locationsRoute } from './routes/(protected)/$brandSlug/locations';
import { Route as rolesRoute } from './routes/(protected)/$brandSlug/roles';
import { Route as roleDetailRoute } from './routes/(protected)/$brandSlug/roles.$roleId';
import { Route as onboardingBrandRoute } from './routes/(protected)/onboarding/brand';
import { Route as dashboardRedirectRoute } from './routes/(protected)/dashboard-redirect.$';
import { Route as menuLayoutRoute } from './routes/(protected)/$brandSlug/menu/_layout';
import { Route as menuCategoriesRoute } from './routes/(protected)/$brandSlug/menu/categories';
import { Route as menuItemsRoute } from './routes/(protected)/$brandSlug/menu/items';
import { Route as menuItemDetailRoute } from './routes/(protected)/$brandSlug/menu/items.$id';
import { Route as menuStopListRoute } from './routes/(protected)/$brandSlug/menu/stop-list';
import { Route as menuModifierGroupsRoute } from './routes/(protected)/$brandSlug/menu/modifier-groups';
import { Route as menuModifierGroupDetailRoute } from './routes/(protected)/$brandSlug/menu/modifier-groups.$id';
import { Route as brandDomainsRoute } from './routes/(protected)/$brandSlug/brands.$slug.domains';
import { Route as brandThemeRoute } from './routes/(protected)/$brandSlug/brands.$slug.theme';
import { Route as brandPayoutsRoute } from './routes/(protected)/$brandSlug/brands.$slug.payouts';
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
]);

const menuRouteTree = menuLayoutRoute.addChildren([
  menuCategoriesRoute,
  menuItemsRoute,
  menuItemDetailRoute,
  menuStopListRoute,
  menuModifierGroupsRoute,
  menuModifierGroupDetailRoute,
]);

const brandSlugRouteTree = brandSlugLayoutRoute.addChildren([
  brandSlugIndexRoute,
  settingsRoute,
  teamRoute,
  rolesRoute,
  roleDetailRoute,
  locationsRoute,
  menuRouteTree,
  brandDomainsRoute,
  brandThemeRoute,
  brandPayoutsRoute,
]);

const protectedRouteTree = protectedLayoutRoute.addChildren([
  brandSlugRouteTree,
  onboardingBrandRoute,
  dashboardRedirectRoute,
]);

const routeTree = rootRoute.addChildren([indexRoute, authRouteTree, protectedRouteTree]);

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found.');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} context={{ queryClient }} />
    </QueryClientProvider>
  </StrictMode>,
);
