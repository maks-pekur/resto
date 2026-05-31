'use server';

import { apiFetchInternal } from '@/lib/api-server-internal';
import { friendlyCatalogError, type ProblemDetails } from '@/lib/menu/catalog-errors';

export interface ReorderCategoryActionState {
  readonly error: string | null;
  readonly success: boolean;
}

interface CategoryListItemFromApi {
  readonly id: string;
  readonly parentId: string | null;
  readonly slug: string;
  readonly name: Record<string, string>;
  readonly description: Record<string, string> | null;
  readonly sortOrder: number;
  readonly status: 'draft' | 'published' | 'archived';
}

interface CategoryListResponseFromApi {
  readonly items: readonly CategoryListItemFromApi[];
}

interface UpsertCategoryBody {
  readonly id: string;
  readonly name: Record<string, string>;
  readonly parentId: string | null;
  readonly sortOrder: number;
}

const postUpsert = async (
  body: UpsertCategoryBody,
): Promise<{ ok: boolean; status: number; data: ProblemDetails | null }> => {
  const res = await apiFetchInternal<unknown>('/internal/v1/catalog/categories', {
    method: 'POST',
    body,
  });
  return {
    ok: res.ok,
    status: res.status,
    data: (res.data as ProblemDetails | null) ?? null,
  };
};

export async function reorderCategoryAction(
  _prev: ReorderCategoryActionState,
  input: { readonly id: string; readonly direction: 'up' | 'down' },
): Promise<ReorderCategoryActionState> {
  const listRes = await apiFetchInternal<CategoryListResponseFromApi>(
    '/internal/v1/catalog/categories',
  );
  if (!listRes.ok || !listRes.data) {
    return {
      error: friendlyCatalogError(listRes.status, listRes.data as ProblemDetails | null),
      success: false,
    };
  }
  const all = listRes.data.items;
  const current = all.find((c) => c.id === input.id);
  if (!current) {
    return { error: 'Category not found.', success: false };
  }

  const siblings = all
    .filter((c) => c.parentId === current.parentId)
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.id.localeCompare(b.id);
    });
  const idx = siblings.findIndex((c) => c.id === current.id);
  const neighborIdx = input.direction === 'up' ? idx - 1 : idx + 1;
  if (neighborIdx < 0 || neighborIdx >= siblings.length) {
    return { error: null, success: true };
  }
  const neighbor = siblings[neighborIdx];
  if (!neighbor) {
    return { error: null, success: true };
  }

  const swapA = await postUpsert({
    id: current.id,
    name: current.name,
    parentId: current.parentId,
    sortOrder: neighbor.sortOrder,
  });
  if (!swapA.ok) {
    return {
      error: friendlyCatalogError(swapA.status, swapA.data),
      success: false,
    };
  }
  const swapB = await postUpsert({
    id: neighbor.id,
    name: neighbor.name,
    parentId: neighbor.parentId,
    sortOrder: current.sortOrder,
  });
  if (!swapB.ok) {
    return {
      error: friendlyCatalogError(swapB.status, swapB.data),
      success: false,
    };
  }
  return { error: null, success: true };
}
