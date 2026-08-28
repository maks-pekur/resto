import { createRoute } from '@tanstack/react-router';
import { Route as locationLayoutRoute } from './_layout';
import { DashboardPage } from '@/components/dashboard-page';

/** One location. The every-location view is the slugless `/dashboard`. */
export const Route = createRoute({
  getParentRoute: () => locationLayoutRoute,
  path: '/dashboard',
  component: DashboardPage,
});
