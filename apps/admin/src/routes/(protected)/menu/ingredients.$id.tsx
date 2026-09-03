import { createRoute } from '@tanstack/react-router';
import { fromLocalizedText } from '@/lib/menu/localized';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/common/empty-state';
import { Route as menuLayoutRoute } from './_layout';
import { modifierGroupQuery } from '@/lib/queries/catalog';
import { GroupEditorShell } from '@/components/menu/group-editor-shell';

export const Route = createRoute({
  getParentRoute: () => menuLayoutRoute,
  path: '/ingredients/$id',
  loader: ({ context: { queryClient }, params: { id } }) => {
    if (id === 'new') return Promise.resolve();
    return queryClient.ensureQueryData(modifierGroupQuery(id));
  },
  component: ModifierGroupDetailPage,
});

function ModifierGroupDetailPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.modifierGroups' });
  const { id } = Route.useParams();
  const isNew = id === 'new';

  const { data } = useQuery({
    ...modifierGroupQuery(id),
    enabled: !isNew,
  });

  const group = isNew ? null : (data?.data ?? null);
  const notFound = !isNew && data !== undefined && (!data.ok || group === null);
  const title = isNew ? t('newGroupTitle') : group ? fromLocalizedText(group.name) : '';

  if (notFound) {
    return (
      <EmptyState
        variant="empty"
        title={t('groupNotFound')}
        description={t('groupNotFoundDescription')}
      />
    );
  }

  return <GroupEditorShell title={title} initialGroup={group} groupId={id} />;
}
