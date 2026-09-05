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
import { Route as dashboardRoute } from './routes/(protected)/dashboard';
import { Route as settingsRoute } from './routes/(protected)/settings';
import { Route as accountRoute } from './routes/(protected)/account';
import { Route as teamRoute } from './routes/(protected)/team';
import { Route as locationsRoute } from './routes/(protected)/locations';
import { Route as locationFormRoute } from './routes/(protected)/locations.$slug';
import { Route as locationTablesRoute } from './routes/(protected)/locations.$slug.tables';
import { Route as locationZoneRoute } from './routes/(protected)/locations.$slug.tables.$zoneId';
import { Route as rolesRoute } from './routes/(protected)/roles';
import { Route as roleDetailRoute } from './routes/(protected)/roles.$roleId';
import { Route as onboardingIndexRoute } from './routes/(protected)/onboarding/index';
import { Route as menuLayoutRoute } from './routes/(protected)/menu/_layout';
import { Route as locationLayoutRoute } from './routes/(protected)/location/_layout';
import { Route as locationDashboardRoute } from './routes/(protected)/location/dashboard';
import { Route as locationOrdersRoute } from './routes/(protected)/location/orders';
import { Route as locationStopListRoute } from './routes/(protected)/location/stop-list';
import {
  OrdersRedirectRoute,
  StopListRedirectRoute,
} from './routes/(protected)/legacy-location-redirects';
import { Route as menuCategoriesRoute } from './routes/(protected)/menu/categories';
import { Route as menuItemsRoute } from './routes/(protected)/menu/items';
import { Route as menuItemDetailRoute } from './routes/(protected)/menu/items.$id';
import { Route as menuModifiersRoute } from './routes/(protected)/menu/modifiers';
import { Route as menuModifierDetailRoute } from './routes/(protected)/menu/modifiers.$id';
import { Route as tenantDomainsRoute } from './routes/(protected)/tenant.domains';
import { Route as tenantThemeRoute } from './routes/(protected)/tenant.theme';
import { Route as tenantPayoutsRoute } from './routes/(protected)/tenant.payouts';
import { Route as tenantTransactionsRoute } from './routes/(protected)/tenant.transactions';

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
  menuModifiersRoute,
  menuModifierDetailRoute,
  StopListRedirectRoute,
]);

// The location-grain pages. `/$locationSlug` matches any first segment, so it is declared last in
// the protected tree and every static root segment is reserved against location slugs.
const locationRouteTree = locationLayoutRoute.addChildren([
  locationDashboardRoute,
  locationOrdersRoute,
  locationStopListRoute,
]);

const protectedRouteTree = protectedLayoutRoute.addChildren([
  dashboardIndexRoute,
  dashboardRoute,
  settingsRoute,
  accountRoute,
  teamRoute,
  rolesRoute,
  roleDetailRoute,
  locationsRoute,
  locationFormRoute,
  locationTablesRoute,
  locationZoneRoute,
  OrdersRedirectRoute,
  menuRouteTree,
  tenantDomainsRoute,
  tenantThemeRoute,
  tenantPayoutsRoute,
  tenantTransactionsRoute,
  onboardingIndexRoute,
  locationRouteTree,
]);

export const routeTree = rootRoute.addChildren([authRouteTree, protectedRouteTree]);
