'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch } from '@/lib/api-server';
import { type ProblemDetails } from '@/lib/menu/catalog-errors';

export interface ToggleStopListResult {
  readonly ok: boolean;
  readonly error: string | null;
}

export interface ToggleStopListInput {
  readonly itemId: string;
  readonly next: 'paused' | 'published';
}

const friendlyError = (status: number, body: ProblemDetails | null): string => {
  if (status === 0) return 'Could not update the stop list. Please try again.';
  if (body?.code === 'catalog.menu_item_not_found') return 'Item not found.';
  if (body?.code === 'catalog.stop_list_item_not_found') return 'Item is not on the stop list.';
  if (status >= 500) return 'Could not update the stop list. Please try again.';
  if (status === 404) return 'Item not found.';
  return body?.detail ?? `Could not update the stop list (${status.toString()}).`;
};

export async function toggleStopListAction(
  input: ToggleStopListInput,
): Promise<ToggleStopListResult> {
  const res =
    input.next === 'paused'
      ? await apiFetch<unknown>('/v1/catalog/stop-list', {
          method: 'POST',
          body: { itemId: input.itemId, reason: null },
        })
      : await apiFetch<unknown>(`/v1/catalog/stop-list/${input.itemId}`, {
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
