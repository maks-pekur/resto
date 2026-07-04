import { createRoute, redirect } from '@tanstack/react-router';
import { Route as rootRoute } from './__root';
import { meBrandsQuery, meQuery } from '@/lib/queries/identity';
import type { MeBrandsResponse, MeResponse } from '@/lib/queries/identity';

export const resolveIndexRedirectSlug = (
  me: MeResponse | null,
  brands: MeBrandsResponse['brands'],
): string | null => {
  if (brands.length === 0) return null;
  const active =
    me?.activeBrandId != null ? brands.find((b) => b.id === me.activeBrandId) : undefined;
  return (active ?? brands[0])?.slug ?? null;
};

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async ({ context: { queryClient } }) => {
    const [meResult, brandsResult] = await Promise.all([
      queryClient.fetchQuery(meQuery()),
      queryClient.fetchQuery(meBrandsQuery()),
    ]);
    const brands = brandsResult.data?.brands ?? [];
    const slug = resolveIndexRedirectSlug(meResult.data, brands);
    if (!slug) {
      throw redirect({ to: '/onboarding/brand' });
    }
    throw redirect({ to: '/$brandSlug', params: { brandSlug: slug } });
  },
});
