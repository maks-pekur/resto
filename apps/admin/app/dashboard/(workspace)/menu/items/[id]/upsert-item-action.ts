'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { apiFetchInternal } from '@/lib/api-server-internal';
import { ItemEditorFormSchema, type ItemEditorForm } from '@/lib/menu/zod-schemas';
import { toLocalizedText } from '@/lib/menu/localized';
import { friendlyCatalogError, type ProblemDetails } from '@/lib/menu/catalog-errors';

interface UpsertItemResponse {
  readonly id: string;
}

export type UpsertItemActionResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly error: string };

export async function upsertItemAction(
  itemId: string,
  values: ItemEditorForm,
  photoS3Key: string | null,
): Promise<UpsertItemActionResult> {
  const parsed = ItemEditorFormSchema.safeParse(values);
  if (!parsed.success) {
    const t = await getTranslations('menu.editor');
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('validateForm') };
  }

  const payload: Record<string, unknown> = {
    categoryId: parsed.data.categoryId,
    name: toLocalizedText(parsed.data.name),
    description: parsed.data.description ? toLocalizedText(parsed.data.description) : null,
    basePrice: parsed.data.basePrice.toFixed(2),
    currency: parsed.data.currency,
    allergens: parsed.data.allergens,
    proteins: parsed.data.proteins,
    fats: parsed.data.fats,
    carbs: parsed.data.carbs,
    kcal: parsed.data.kcal,
    nutritionEstimated: parsed.data.nutritionEstimated,
    source: 'manual',
    photos: photoS3Key ? [{ s3Key: photoS3Key, sortOrder: 0, isPrimary: true }] : [],
  };
  if (itemId !== 'new') payload.id = itemId;

  const res = await apiFetchInternal<UpsertItemResponse>('/internal/v1/catalog/items', {
    method: 'POST',
    body: payload,
  });
  if (!res.ok || !res.data) {
    return {
      ok: false,
      error: friendlyCatalogError(res.status, res.data as ProblemDetails | null),
    };
  }

  const id = res.data.id;
  revalidatePath('/dashboard/menu', 'layout');
  revalidatePath(`/dashboard/menu/items/${id}`);
  return { ok: true, id };
}
