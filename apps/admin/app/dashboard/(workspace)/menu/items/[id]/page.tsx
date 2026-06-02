import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';
import { PageHeading } from '@/components/page-heading';
import { apiFetch } from '@/lib/api-server';
import { apiFetchInternal } from '@/lib/api-server-internal';
import { fromLocalizedText } from '@/lib/menu/localized';
import { ItemEditorShellClient } from './item-editor-shell-client';
import type { CategoryOption, ItemDetailApi } from './types';

interface MeResponse {
  readonly kind?: string;
  readonly tenantId?: string;
  readonly baseRole?: 'owner' | 'admin' | 'staff';
}

interface CategoryRowApi {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: Record<string, string>;
}

interface CategoryListApi {
  readonly items: readonly CategoryRowApi[];
}

interface ModifierGroupListItemApi {
  readonly id: string;
  readonly name: Record<string, string>;
  readonly optionCount: number;
}

interface ModifierGroupListApi {
  readonly items: readonly ModifierGroupListItemApi[];
}

interface ItemEditorPageProps {
  readonly params: Promise<{ readonly id: string }>;
}

const DEFAULT_CURRENCY = 'EUR';

export default async function ItemEditorPage(
  props: ItemEditorPageProps,
): Promise<React.ReactElement> {
  const me = await apiFetch<MeResponse>('/v1/me');
  if (!me.ok || me.data?.kind !== 'operator' || !me.data.tenantId) {
    redirect('/login');
  }

  const params = await props.params;
  const isNew = params.id === 'new';

  const [itemRes, categoriesRes, modifierGroupsRes] = await Promise.all([
    isNew
      ? Promise.resolve(null)
      : apiFetchInternal<ItemDetailApi>(`/internal/v1/catalog/items/${params.id}`),
    apiFetchInternal<CategoryListApi>('/internal/v1/catalog/categories'),
    apiFetchInternal<ModifierGroupListApi>('/internal/v1/catalog/modifier-groups'),
  ]);

  if (!isNew && itemRes && (itemRes.status === 404 || !itemRes.ok || !itemRes.data)) {
    const t = await getTranslations('menu.editor');
    return (
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <EmptyState variant="empty" title={t('notFound')} description={t('notFoundDescription')} />
      </div>
    );
  }

  const item: ItemDetailApi | null = isNew ? null : (itemRes?.data ?? null);
  const categories: readonly CategoryOption[] = (categoriesRes.data?.items ?? []).map((c) => ({
    id: c.id,
    parentId: c.parentId,
    name: fromLocalizedText(c.name),
  }));
  const availableModifierGroups = (modifierGroupsRes.data?.items ?? []).map((g) => ({
    id: g.id,
    name: fromLocalizedText(g.name),
    optionCount: g.optionCount,
  }));

  const tDash = await getTranslations('dashboard');
  const itemName = item ? fromLocalizedText(item.name) : '';
  const title = isNew ? tDash('newItemTitle') : itemName || tDash('editItemTitle');

  return (
    <>
      <PageHeading title={title} />
      <ItemEditorShellClient
        initialItem={item}
        categories={categories}
        itemId={params.id}
        defaultCurrency={item?.currency ?? DEFAULT_CURRENCY}
        availableModifierGroups={availableModifierGroups}
      />
    </>
  );
}
