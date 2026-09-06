import { createRoute } from '@tanstack/react-router';
import { Route as protectedLayoutRoute } from './_layout';
import { requirePermission } from '@/lib/auth/permissions';
import { PageHeading } from '@/components/common/page-heading';

export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/tenant/theme',
  beforeLoad: requirePermission('settings', 'update'),
  component: TenantThemePage,
});

function TenantThemePage() {
  return (
    <>
      <PageHeading title="Theme" />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <p className="text-muted-foreground text-sm">Theme editor ships with RES-91.</p>
      </div>
    </>
  );
}
