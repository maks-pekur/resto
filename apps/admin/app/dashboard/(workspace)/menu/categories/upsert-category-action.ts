'use server';

import { revalidatePath } from 'next/cache';
import { apiFetchInternal } from '@/lib/api-server-internal';
import { CategoryFormSchema } from '@/lib/menu/zod-schemas';
import { toLocalizedText } from '@/lib/menu/localized';

interface ProblemDetails {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly message?: string;
  readonly code?: string;
}

interface UpsertCategoryResponse {
  readonly id: string;
}

export interface UpsertCategoryActionState {
  readonly error: string | null;
  readonly success: { readonly id: string } | null;
}

export const friendlyCatalogError = (status: number, body: ProblemDetails | null): string => {
  if (status === 0) return 'Серверная ошибка. Попробуйте ещё раз.';
  if (status === 404 || body?.code === 'catalog.menu_category_not_found') {
    return 'Категория не найдена.';
  }
  if (status === 409 && body?.code === 'catalog.menu_category_slug_taken') {
    return 'Категория с таким названием уже существует.';
  }
  if (status === 400) {
    return body?.message ?? body?.detail ?? 'Проверьте поля формы.';
  }
  if (status >= 500) return 'Серверная ошибка. Попробуйте ещё раз.';
  return body?.detail ?? `Запрос не выполнен (${status.toString()}).`;
};

export async function upsertCategoryAction(
  _prev: UpsertCategoryActionState,
  formData: FormData,
): Promise<UpsertCategoryActionState> {
  const rawId = formData.get('id');
  const rawName = formData.get('name');
  const rawParentId = formData.get('parentId');
  const rawSortOrder = formData.get('sortOrder');

  const parentIdNormalized =
    typeof rawParentId === 'string' && rawParentId.length > 0 ? rawParentId : null;
  const sortOrderNum = (() => {
    if (typeof rawSortOrder !== 'string' || rawSortOrder.length === 0) return 0;
    const n = Number.parseInt(rawSortOrder, 10);
    return Number.isFinite(n) ? n : Number.NaN;
  })();

  const parsed = CategoryFormSchema.safeParse({
    name: typeof rawName === 'string' ? rawName : '',
    parentId: parentIdNormalized,
    sortOrder: sortOrderNum,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Проверьте поля формы.',
      success: null,
    };
  }

  const payload: {
    id?: string;
    name: Record<string, string>;
    parentId: string | null;
    sortOrder: number;
  } = {
    name: toLocalizedText(parsed.data.name),
    parentId: parsed.data.parentId,
    sortOrder: parsed.data.sortOrder,
  };
  if (typeof rawId === 'string' && rawId.length > 0) {
    payload.id = rawId;
  }

  const res = await apiFetchInternal<UpsertCategoryResponse>('/internal/v1/catalog/categories', {
    method: 'POST',
    body: payload,
  });
  if (!res.ok) {
    return {
      error: friendlyCatalogError(res.status, res.data as ProblemDetails | null),
      success: null,
    };
  }
  revalidatePath('/dashboard/menu', 'layout');
  return {
    error: null,
    success: { id: res.data?.id ?? '' },
  };
}
