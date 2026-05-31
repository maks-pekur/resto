'use server';

import { revalidatePath } from 'next/cache';
import { apiFetchInternal } from '@/lib/api-server-internal';

/**
 * Plan 04b-06 Task 1 — soft-archive an item (D-4b-07).
 *
 * Hard deletes are forbidden (ADR-0020 + Catalog domain policy). Archive
 * sets `status='archived'` server-side via the dedicated PATCH route.
 * Mirrors `archive-category-action.ts` shape from Plan 04b-05.
 *
 * Pattern S8: revalidatePath layout so the sticky bar diff count and the
 * items table (default filter excludes archived) refresh immediately.
 */

interface ProblemDetails {
  readonly code?: string;
  readonly detail?: string;
  readonly message?: string;
}

export interface ArchiveItemActionState {
  readonly error: string | null;
  readonly success: boolean;
}

const friendlyError = (status: number, body: ProblemDetails | null): string => {
  if (status === 0) return 'Серверная ошибка. Попробуйте ещё раз.';
  if (status === 404 || body?.code === 'catalog.menu_item_not_found') {
    return 'Блюдо не найдено.';
  }
  if (status >= 500) return 'Серверная ошибка. Попробуйте ещё раз.';
  return body?.detail ?? `Запрос не выполнен (${status.toString()}).`;
};

export async function archiveItemAction(
  _prev: ArchiveItemActionState,
  input: { readonly id: string },
): Promise<ArchiveItemActionState> {
  const res = await apiFetchInternal<unknown>(`/internal/v1/catalog/items/${input.id}/archive`, {
    method: 'PATCH',
  });
  if (!res.ok) {
    return {
      error: friendlyError(res.status, res.data as ProblemDetails | null),
      success: false,
    };
  }
  revalidatePath('/dashboard/menu', 'layout');
  return { error: null, success: true };
}
