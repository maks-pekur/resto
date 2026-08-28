import { createRoute, Outlet } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Route as protectedLayoutRoute } from '../_layout';
import { requirePermission } from '@/lib/auth/permissions';
import { draftDiffQuery } from '@/lib/queries/catalog';
import { StickyPublishBar } from '@/components/menu/sticky-publish-bar';

export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/menu',
  beforeLoad: requirePermission('menu', 'read'),
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(draftDiffQuery()),
  component: MenuLayout,
});

function MenuLayout() {
  const { data } = useSuspenseQuery(draftDiffQuery());
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
      <StickyPublishBar unpublishedCount={unpublishedCount} diffItems={diffItems} />
    </>
  );
}
