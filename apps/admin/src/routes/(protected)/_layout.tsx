import { createRoute, Outlet, redirect } from '@tanstack/react-router';
import { Route as rootRoute } from '../__root';
import { authClient } from '@/lib/auth-client';
import { safeNext } from '@/lib/auth/safe-next';

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  id: '/(protected)',
  beforeLoad: async ({ location }) => {
    const session = await authClient.getSession();
    if (!session.data?.session) {
      throw redirect({
        to: '/login',
        search: { next: safeNext(location.pathname) },
      });
    }
  },
  component: () => <Outlet />,
});
