'use server';

import { apiFetch } from '@/lib/api-server';
import { friendlyCatalogError, type ProblemDetails } from '@/lib/menu/catalog-errors';

export interface ReorderCategoriesActionState {
  readonly error: string | null;
  readonly success: boolean;
}

export interface CategoryMoveInput {
  readonly id: string;
  readonly parentId: string | null;
  readonly sortOrder: number;
}

interface ReorderResponse {
  readonly updated: number;
}

export async function reorderCategoriesAction(
  _prev: ReorderCategoriesActionState,
  input: { readonly moves: readonly CategoryMoveInput[] },
): Promise<ReorderCategoriesActionState> {
  if (input.moves.length === 0) {
    return { error: null, success: true };
  }
  const res = await apiFetch<ReorderResponse>('/v1/catalog/categories/reorder', {
    method: 'POST',
    body: { moves: input.moves },
  });
  if (!res.ok) {
    return {
      error: friendlyCatalogError(res.status, res.data as ProblemDetails | null),
      success: false,
    };
  }
  return { error: null, success: true };
}
