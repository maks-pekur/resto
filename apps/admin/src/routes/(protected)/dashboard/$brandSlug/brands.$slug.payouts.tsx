import { createRoute, useParams } from '@tanstack/react-router';
import { Route as brandSlugLayoutRoute } from '../_layout';
import { PageHeading } from '@/components/page-heading';

export const Route = createRoute({
  getParentRoute: () => brandSlugLayoutRoute,
  path: '/brands/$slug/payouts',
  component: BrandPayoutsPage,
});

function BrandPayoutsPage() {
  const { brandSlug } = useParams({ strict: false });

  return (
    <>
      <PageHeading title="Brand Payouts" />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <p className="text-muted-foreground text-sm">
          Stripe Connect payout dashboard for <span className="font-mono">{brandSlug}</span> ships
          with RES-92.
        </p>
      </div>
    </>
  );
}
