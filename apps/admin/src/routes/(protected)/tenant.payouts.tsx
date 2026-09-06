import { createRoute } from '@tanstack/react-router';
import { Route as protectedLayoutRoute } from './_layout';
import { requirePermission } from '@/lib/auth/permissions';
import { PageHeading } from '@/components/common/page-heading';
import { PaymentsSection } from '@/components/settings/payments-section';

export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/tenant/payouts',
  beforeLoad: requirePermission('billing', 'read'),
  component: TenantPayoutsPage,
});

function TenantPayoutsPage() {
  return (
    <>
      <PageHeading title="Payouts" />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <PaymentsSection />
      </div>
    </>
  );
}
