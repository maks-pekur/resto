'use server';

import { revalidatePath } from 'next/cache';
import { apiFetchInternal } from '@/lib/api-server-internal';
import { friendlyCatalogError } from './upsert-category-action';

/**
 * Plan 04b-05 Task 2 — reorder a category via swap with its neighbour
 * (drag-drop is deferred per D-4b-01; up/down buttons are the MVP-1 UX).
 *
 * Plan 02 did not add a batch-reorder endpoint, so the action performs two
 * sequential upsert POSTs (T-04b-05-04 in threat register: accepted — <100
 * categories per tenant in MVP-1). The boundary sends back the existing
 * `LocalizedText` `name` shape unchanged — we never lift a plain string
 * here because we already have the api shape from the GET.
 *
 * Pattern S8: revalidatePath layout on success.
 */

export interface ReorderCategoryActionState {
  readonly error: string | null;
  readonly success: boolean;
}

interface ProblemDetails {
  readonly code?: string;
  readonly detail?: string;
  readonly message?: string;
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
    return { error: 'Категория не найдена.', success: false };
  }

  // Siblings = same parentId scope, sorted by sortOrder ASC then id for
  // determinism on ties.
  const siblings = all
    .filter((c) => c.parentId === current.parentId)
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.id.localeCompare(b.id);
    });
  const idx = siblings.findIndex((c) => c.id === current.id);
  const neighborIdx = input.direction === 'up' ? idx - 1 : idx + 1;
  if (neighborIdx < 0 || neighborIdx >= siblings.length) {
    // No neighbour in that direction — no-op success (UI hides the button
    // at boundaries but a stray request is harmless).
    return { error: null, success: true };
  }
  const neighbor = siblings[neighborIdx];
  if (!neighbor) {
    return { error: null, success: true };
  }

  // Swap sortOrder values via two sequential upserts. Both rows preserve
  // their existing name + parentId — we only flip the integer.
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
  revalidatePath('/dashboard/menu', 'layout');
  return { error: null, success: true };
}
