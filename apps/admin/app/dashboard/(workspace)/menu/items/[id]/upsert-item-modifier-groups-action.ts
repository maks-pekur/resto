'use server';

import { revalidatePath } from 'next/cache';
import { apiFetchInternal } from '@/lib/api-server-internal';
import { friendlyCatalogError, type ProblemDetails } from '@/lib/menu/catalog-errors';
import type { ItemDetailApi } from './types';

interface UpsertItemResponse {
  readonly id: string;
}

export type UpsertItemModifierGroupsResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

export async function upsertItemModifierGroupsAction(
  itemId: string,
  modifierGroupIds: readonly string[],
): Promise<UpsertItemModifierGroupsResult> {
  const itemRes = await apiFetchInternal<ItemDetailApi>(`/internal/v1/catalog/items/${itemId}`);
  if (!itemRes.ok || !itemRes.data) {
    return {
      ok: false,
      error: friendlyCatalogError(itemRes.status, itemRes.data as ProblemDetails | null),
    };
  }

  const item = itemRes.data;
  const payload: Record<string, unknown> = {
    id: item.id,
    categoryId: item.categoryId,
    name: item.name,
    description: item.description,
    basePrice: item.basePrice,
    currency: item.currency,
    allergens: [...item.allergens],
    proteins: item.proteins,
    fats: item.fats,
    carbs: item.carbs,
    kcal: item.kcal,
    nutritionEstimated: item.nutritionEstimated,
    source: item.source,
    photos: item.photos.map((p) => ({
      s3Key: p.s3Key,
      sortOrder: p.sortOrder,
      isPrimary: p.isPrimary,
    })),
    modifierGroupIds: [...modifierGroupIds],
  };

  const res = await apiFetchInternal<UpsertItemResponse>('/internal/v1/catalog/items', {
    method: 'POST',
    body: payload,
  });
  if (!res.ok) {
    return {
      ok: false,
      error: friendlyCatalogError(res.status, res.data as ProblemDetails | null),
    };
  }

  revalidatePath('/dashboard/menu', 'layout');
  revalidatePath(`/dashboard/menu/items/${itemId}`);
  return { ok: true };
}
