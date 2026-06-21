import { createRoute, Outlet } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Route as brandSlugLayoutRoute } from '../_layout';
import { draftDiffQuery } from '@/lib/queries/catalog';
import { StickyPublishBar } from '@/components/menu/sticky-publish-bar';

export const Route = createRoute({
  getParentRoute: () => brandSlugLayoutRoute,
  path: '/menu',
  loader: ({ context: { queryClient }, params: { brandSlug } }) =>
    queryClient.ensureQueryData(draftDiffQuery(brandSlug)),
  component: MenuLayout,
});

function MenuLayout() {
  const { brandSlug } = Route.useParams();
  const { data } = useSuspenseQuery(draftDiffQuery(brandSlug));
  const unpublishedCount = data.data?.unpublishedCount ?? 0;
  const diffItems = (data.data?.items ?? []).map((entry) => ({
    entityType: entry.entityType,
    id: entry.id,
    name:
      typeof entry.name === 'string'
        ? entry.name
        : (entry.name.ru ?? entry.name.en ?? Object.values(entry.name)[0] ?? ''),
    status: entry.status,
  }));

  return (
    <>
      <Outlet />
      <StickyPublishBar
        brandSlug={brandSlug}
        unpublishedCount={unpublishedCount}
        diffItems={diffItems}
      />
    </>
  );
}
