'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { apiFetchInternal } from '@/lib/api-server-internal';
import { SizeFormSchema } from '@/lib/menu/zod-schemas';
import { toLocalizedText } from '@/lib/menu/localized';
import { friendlyCatalogError, type ProblemDetails } from '@/lib/menu/catalog-errors';

interface UpsertItemSizeResponse {
  readonly id: string;
}

export interface UpsertItemSizeInput {
  readonly sizeId?: string;
  readonly name: string;
  readonly price: number;
  readonly isDefault: boolean;
}

export type UpsertItemSizeActionResult =
  | { readonly ok: true; readonly id?: string }
  | { readonly ok: false; readonly error: string };

export async function upsertItemSizeAction(
  itemId: string,
  values: UpsertItemSizeInput,
  isDelete?: boolean,
): Promise<UpsertItemSizeActionResult> {
  if (isDelete) {
    if (!values.sizeId) {
      const t = await getTranslations('menu.sizes');
      return { ok: false, error: t('sizeIdMissing') };
    }
    const res = await apiFetchInternal(`/internal/v1/catalog/item-sizes/${values.sizeId}`, {
      method: 'DELETE',
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

  const parsed = SizeFormSchema.safeParse({
    name: values.name,
    price: values.price,
    isDefault: values.isDefault,
  });
  if (!parsed.success) {
    const t = await getTranslations('menu.sizes');
    return { ok: false, error: parsed.error.issues[0]?.message ?? t('validateSize') };
  }

  const payload: Record<string, unknown> = {
    itemId,
    name: toLocalizedText(parsed.data.name),
    price: parsed.data.price.toFixed(2),
    isDefault: parsed.data.isDefault,
  };
  if (values.sizeId) payload.id = values.sizeId;

  const res = await apiFetchInternal<UpsertItemSizeResponse>('/internal/v1/catalog/item-sizes', {
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
  return { ok: true, id: res.data?.id };
}
