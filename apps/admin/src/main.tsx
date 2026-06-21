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
import { Route as dashboardLayoutRoute } from './routes/(protected)/dashboard/_layout';
import { Route as dashboardIndexRoute } from './routes/(protected)/dashboard/index';
import { Route as brandSlugLayoutRoute } from './routes/(protected)/dashboard/$brandSlug/_layout';
import { Route as onboardingBrandRoute } from './routes/(protected)/onboarding/brand';
import { Route as dashboardSettingsRoute } from './routes/(protected)/dashboard/settings';
import { Route as dashboardTeamRoute } from './routes/(protected)/dashboard/team';
import { Route as menuLayoutRoute } from './routes/(protected)/dashboard/$brandSlug/menu/_layout';
import { Route as menuCategoriesRoute } from './routes/(protected)/dashboard/$brandSlug/menu/categories';
import { Route as menuItemsRoute } from './routes/(protected)/dashboard/$brandSlug/menu/items';
import { Route as menuItemDetailRoute } from './routes/(protected)/dashboard/$brandSlug/menu/items.$id';
import { Route as menuStopListRoute } from './routes/(protected)/dashboard/$brandSlug/menu/stop-list';
import { Route as menuModifierGroupsRoute } from './routes/(protected)/dashboard/$brandSlug/menu/modifier-groups';
import { Route as menuModifierGroupDetailRoute } from './routes/(protected)/dashboard/$brandSlug/menu/modifier-groups.$id';
import { Route as brandDomainsRoute } from './routes/(protected)/dashboard/$brandSlug/brands.$slug.domains';
import { Route as brandThemeRoute } from './routes/(protected)/dashboard/$brandSlug/brands.$slug.theme';
import { Route as brandPayoutsRoute } from './routes/(protected)/dashboard/$brandSlug/brands.$slug.payouts';
import '@resto/config-tailwind/tokens.css';
import './styles.css';

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
  menuRouteTree,
  brandDomainsRoute,
  brandThemeRoute,
  brandPayoutsRoute,
]);

const dashboardRouteTree = dashboardLayoutRoute.addChildren([
  dashboardIndexRoute,
  dashboardSettingsRoute,
  dashboardTeamRoute,
  brandSlugRouteTree,
]);

const protectedRouteTree = protectedLayoutRoute.addChildren([
  dashboardRouteTree,
  onboardingBrandRoute,
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
