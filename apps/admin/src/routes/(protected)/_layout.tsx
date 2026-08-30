import type { CSSProperties } from 'react';
import { createRoute, Outlet, redirect, useNavigate, useRouterState } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Route as rootRoute } from '../__root';
import { authClient } from '@/lib/auth-client';
import { safeNext } from '@/lib/auth/safe-next';
import { meQuery, meTenantsQuery, toOperatorSummary } from '@/lib/queries/identity';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { SiteHeader } from '@/components/layout/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

const sidebarStyle: CSSProperties = {
  '--sidebar-width': '16rem',
  '--sidebar-width-icon': '3rem',
  '--header-height': 'calc(var(--spacing) * 14)',
} as CSSProperties;

const ONBOARDING_ROUTE = '/onboarding';
const ONBOARDING_PATH_PREFIX = '/onboarding';

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
  component: ProtectedLayout,
});

function ProtectedLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: meResult } = useSuspenseQuery(meQuery());
  const { data: tenantsResult } = useSuspenseQuery(meTenantsQuery());

  const operator = meResult.data ? toOperatorSummary(meResult.data) : null;
  if (!operator) {
    void navigate({ to: '/login' });
    return null;
  }

  const tenants = tenantsResult.data?.tenants ?? [];
  const onOnboarding = pathname.startsWith(ONBOARDING_PATH_PREFIX);
  // D-31: resume onboarding derived from tenant status alone — no progress
  // flag, no cookie. Two or more tenants is a sign-in-time picker concern
  // (plan 17); this layout only ever renders in that case.
  const needsOnboarding =
    tenants.length === 0 || (tenants.length === 1 && tenants[0]?.status === 'pending_setup');

  if (needsOnboarding) {
    if (!onOnboarding) {
      void navigate({ to: ONBOARDING_ROUTE });
      return null;
    }
    return <Outlet />;
  }

  return (
    <SidebarProvider style={sidebarStyle}>
      <AppSidebar />
      <SidebarInset>
        <SiteHeader operator={operator} />
        <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
