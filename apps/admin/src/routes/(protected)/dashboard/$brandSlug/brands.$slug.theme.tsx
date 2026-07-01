import { createRoute, useParams } from '@tanstack/react-router';
import { Route as brandSlugLayoutRoute } from '../_layout';
import { PageHeading } from '@/components/page-heading';

export const Route = createRoute({
  getParentRoute: () => brandSlugLayoutRoute,
  path: '/theme',
  component: BrandThemePage,
});

function BrandThemePage() {
  const { brandSlug } = useParams({ strict: false });

  return (
    <>
      <PageHeading title="Brand Theme" />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <p className="text-muted-foreground text-sm">
          Per-brand theme editor for <span className="font-mono">{brandSlug}</span> ships with
          RES-91.
        </p>
      </div>
    </>
  );
}
