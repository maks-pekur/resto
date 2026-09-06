import { createRoute } from '@tanstack/react-router';
import { Route as protectedLayoutRoute } from './_layout';
import { DashboardPage } from '@/components/dashboard/dashboard-page';

/** Every location. One point's dashboard lives at `/{locationSlug}/dashboard`. */
export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/dashboard',
  component: DashboardPage,
});
