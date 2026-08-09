import type { CSSProperties } from 'react';
import { createRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { Route as protectedLayoutRoute } from '../_layout';
import { meQuery, meBrandsQuery, toOperatorSummary } from '@/lib/queries/identity';
import { AppSidebar } from '@/components/app-sidebar';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

const sidebarStyle: CSSProperties = {
  '--sidebar-width': '16rem',
  '--sidebar-width-icon': '3rem',
  '--header-height': 'calc(var(--spacing) * 14)',
} as CSSProperties;

// D-01: owner location filter. Any value outside this union is dropped by
// zod at the edge, leaving `location` undefined -> use-effective-location
// resolves the D-03 default.
const locationSearchSchema = z.object({
  location: z.union([z.literal('all'), z.string().uuid()]).optional(),
});

export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/$brandSlug',
  validateSearch: locationSearchSchema,
  component: BrandLayout,
});

function BrandLayout() {
  const navigate = useNavigate();
  const { data: meResult } = useSuspenseQuery(meQuery());
  const { data: brandsResult } = useSuspenseQuery(meBrandsQuery());

  const operator = meResult.data ? toOperatorSummary(meResult.data) : null;
  if (!operator) {
    void navigate({ to: '/login' });
    return null;
  }

  const brands = brandsResult.data?.brands ?? [];
  const { brandSlug: activeBrandSlug } = Route.useParams();

  if (brands.length === 0) {
    void navigate({ to: '/onboarding/brand' });
    return null;
  }

  return (
    <SidebarProvider style={sidebarStyle}>
      <AppSidebar brands={brands} activeBrandSlug={activeBrandSlug} operator={operator} />
      <SidebarInset>
        <SiteHeader />
        <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
