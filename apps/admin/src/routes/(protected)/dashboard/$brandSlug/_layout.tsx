import { createRoute, Outlet } from '@tanstack/react-router';
import { Route as dashboardLayoutRoute } from '../_layout';

export const Route = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/$brandSlug',
  component: () => <Outlet />,
});
