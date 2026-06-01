'use server';

import { apiFetchInternal } from '@/lib/api-server-internal';
import { friendlyCatalogError, type ProblemDetails } from '@/lib/menu/catalog-errors';

export interface ReorderCategoriesActionState {
  readonly error: string | null;
  readonly success: boolean;
}

interface ReorderResponse {
  readonly updated: number;
}

export async function reorderCategoriesAction(
  _prev: ReorderCategoriesActionState,
  input: { readonly parentId: string | null; readonly orderedIds: readonly string[] },
): Promise<ReorderCategoriesActionState> {
  if (input.orderedIds.length === 0) {
    return { error: null, success: true };
  }
  const res = await apiFetchInternal<ReorderResponse>('/internal/v1/catalog/categories/reorder', {
    method: 'POST',
    body: { parentId: input.parentId, orderedIds: input.orderedIds },
  });
  if (!res.ok) {
    return {
      error: friendlyCatalogError(res.status, res.data as ProblemDetails | null),
      success: false,
    };
  }
  return { error: null, success: true };
}
