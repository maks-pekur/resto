'use server';

import { revalidatePath } from 'next/cache';
import { apiFetchInternal } from '@/lib/api-server-internal';

interface ProblemDetails {
  readonly code?: string;
  readonly detail?: string;
  readonly message?: string;
}

export interface ToggleStopListResult {
  readonly ok: boolean;
  readonly error: string | null;
}

export interface ToggleStopListInput {
  readonly itemId: string;
  readonly next: 'paused' | 'published';
}

const friendlyError = (status: number, body: ProblemDetails | null): string => {
  if (status === 0) return 'Не удалось обновить стоп-лист. Попробуйте ещё раз.';
  if (body?.code === 'catalog.menu_item_not_found') return 'Блюдо не найдено.';
  if (body?.code === 'catalog.stop_list_item_not_found') return 'Блюдо не в стоп-листе.';
  if (status >= 500) return 'Не удалось обновить стоп-лист. Попробуйте ещё раз.';
  if (status === 404) return 'Блюдо не найдено.';
  return body?.detail ?? `Не удалось обновить стоп-лист (${status.toString()}).`;
};

export async function toggleStopListAction(
  input: ToggleStopListInput,
): Promise<ToggleStopListResult> {
  const res =
    input.next === 'paused'
      ? await apiFetchInternal<unknown>('/internal/v1/catalog/stop-list', {
          method: 'POST',
          body: { itemId: input.itemId, reason: null },
        })
      : await apiFetchInternal<unknown>(`/internal/v1/catalog/stop-list/${input.itemId}`, {
          method: 'DELETE',
        });
  if (!res.ok) {
    return {
      ok: false,
      error: friendlyError(res.status, res.data as ProblemDetails | null),
    };
  }
  revalidatePath('/dashboard/menu', 'layout');
  return { ok: true, error: null };
}
