import { createRoute } from '@tanstack/react-router';
import { useSuspenseQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Route as menuLayoutRoute } from './_layout';
import { itemQuery, categoriesQuery, modifierGroupsQuery } from '@/lib/queries/catalog';
import { ItemEditorShell } from '@/components/menu/item-editor-shell';
import { fromLocalizedText } from '@/lib/menu/localized';

export const Route = createRoute({
  getParentRoute: () => menuLayoutRoute,
  path: '/items/$id',
  loader: ({ context: { queryClient }, params: { brandSlug, id } }) => {
    const loaders: Promise<unknown>[] = [
      queryClient.ensureQueryData(categoriesQuery(brandSlug)),
      queryClient.ensureQueryData(modifierGroupsQuery(brandSlug)),
    ];
    if (id !== 'new') {
      loaders.push(queryClient.ensureQueryData(itemQuery(brandSlug, id)));
    }
    return Promise.all(loaders);
  },
  component: ItemDetailPage,
});

function ItemDetailPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.editor' });
  const { brandSlug, id } = Route.useParams();
  const { data: catResult } = useSuspenseQuery(categoriesQuery(brandSlug));
  const { data: mgResult } = useSuspenseQuery(modifierGroupsQuery(brandSlug));

  const isNew = id === 'new';
  const { data: itemResult } = useQuery({
    ...itemQuery(brandSlug, id),
    enabled: !isNew,
  });

  const categories = catResult.data?.items ?? [];
  const modifierGroups = (mgResult.data?.items ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    optionCount: 0,
  }));

  const item = isNew ? null : (itemResult?.data ?? null);
  const title = isNew ? t('newItemTitle') : fromLocalizedText(item?.name ?? {});

  return (
    <ItemEditorShell
      brandSlug={brandSlug}
      title={title}
      initialItem={item}
      categories={categories}
      itemId={id}
      defaultCurrency="RUB"
      availableModifierGroups={modifierGroups}
    />
  );
}
