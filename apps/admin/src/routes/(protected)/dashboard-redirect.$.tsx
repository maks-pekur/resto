import { createRoute, redirect } from '@tanstack/react-router';
import { Route as protectedLayoutRoute } from './_layout';

export const resolveLegacyDashboardRedirect = (splat: string): string => {
  const candidate = splat.length > 0 ? `/${splat}` : '/';
  return /^\/[/\\]/.test(candidate) ? '/' : candidate;
};

export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/dashboard/$',
  beforeLoad: ({ params }) => {
    const splat = (params as Record<string, string>)['*'] ?? '';
    throw redirect({ to: resolveLegacyDashboardRedirect(splat), replace: true });
  },
});
