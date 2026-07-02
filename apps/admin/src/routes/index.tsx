import { createRoute, redirect } from '@tanstack/react-router';
import { Route as rootRoute } from './__root';
import { meBrandsQuery } from '@/lib/queries/identity';

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async ({ context: { queryClient } }) => {
    const result = await queryClient.fetchQuery(meBrandsQuery());
    const brands = result.data?.brands ?? [];
    const firstSlug = brands[0]?.slug;
    if (!firstSlug) {
      throw redirect({ to: '/onboarding/brand' });
    }
    throw redirect({ to: '/$brandSlug', params: { brandSlug: firstSlug } });
  },
});
