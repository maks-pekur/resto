import { createRoute } from '@tanstack/react-router';
import { useSuspenseQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/empty-state';
import { Route as menuLayoutRoute } from './_layout';
import { itemQuery, categoriesQuery, modifierGroupsQuery } from '@/lib/queries/catalog';
import { ItemEditorShell } from '@/components/menu/item-editor-shell';
import { fromLocalizedText } from '@/lib/menu/localized';

export const Route = createRoute({
  getParentRoute: () => menuLayoutRoute,
  path: '/items/$id',
  loader: ({ context: { queryClient }, params: { id } }) => {
    const loaders: Promise<unknown>[] = [
      queryClient.ensureQueryData(categoriesQuery()),
      queryClient.ensureQueryData(modifierGroupsQuery()),
    ];
    if (id !== 'new') {
      loaders.push(queryClient.ensureQueryData(itemQuery(id)));
    }
    return Promise.all(loaders);
  },
  component: ItemDetailPage,
});

function ItemDetailPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.editor' });
  const { id } = Route.useParams();
  const { data: catResult } = useSuspenseQuery(categoriesQuery());
  const { data: mgResult } = useSuspenseQuery(modifierGroupsQuery());

  const isNew = id === 'new';
  const { data: itemResult } = useQuery({
    ...itemQuery(id),
    enabled: !isNew,
  });

  const categories = catResult.data?.items ?? [];
  // A group's `name` is localized text in the contract; handing the object straight to
  // a component that renders it makes React throw "Objects are not valid as a React
  // child" — which is what stopped this page opening at all.
  const modifierGroups = (mgResult.data?.items ?? []).map((g) => ({
    id: g.id,
    name: fromLocalizedText(g.name),
    optionCount: g.optionCount,
  }));

  const item = isNew ? null : (itemResult?.data ?? null);
  const notFound = !isNew && itemResult !== undefined && (!itemResult.ok || item === null);
  const title = isNew ? t('newItemTitle') : fromLocalizedText(item?.name ?? {});

  if (notFound) {
    return (
      <EmptyState variant="empty" title={t('notFound')} description={t('notFoundDescription')} />
    );
  }

  return (
    <ItemEditorShell
      title={title}
      initialItem={item}
      categories={categories}
      itemId={id}
      defaultCurrency="RUB"
      availableModifierGroups={modifierGroups}
    />
  );
}
