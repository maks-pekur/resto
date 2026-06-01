import { redirect } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
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

  const [itemRes, categoriesRes] = await Promise.all([
    isNew
      ? Promise.resolve(null)
      : apiFetchInternal<ItemDetailApi>(`/internal/v1/catalog/items/${params.id}`),
    apiFetchInternal<CategoryListApi>('/internal/v1/catalog/categories'),
  ]);

  if (!isNew && itemRes && (itemRes.status === 404 || !itemRes.ok || !itemRes.data)) {
    return (
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <EmptyState
          variant="empty"
          title="Блюдо не найдено"
          description="Возможно, оно было удалено."
        />
      </div>
    );
  }

  const item: ItemDetailApi | null = isNew ? null : (itemRes?.data ?? null);
  const categories: readonly CategoryOption[] = (categoriesRes.data?.items ?? []).map((c) => ({
    id: c.id,
    parentId: c.parentId,
    name: fromLocalizedText(c.name),
  }));

  return (
    <ItemEditorShellClient
      initialItem={item}
      categories={categories}
      itemId={params.id}
      defaultCurrency={item?.currency ?? DEFAULT_CURRENCY}
    />
  );
}
