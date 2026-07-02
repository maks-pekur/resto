import { createRoute, redirect } from '@tanstack/react-router';
import { Route as protectedLayoutRoute } from './_layout';

export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/dashboard/$',
  beforeLoad: ({ params }) => {
    const splat = (params as Record<string, string>)['*'] ?? '';
    const target = splat.length > 0 ? `/${splat}` : '/';
    throw redirect({ to: target, replace: true });
  },
});
