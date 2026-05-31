'use server';

import { revalidatePath } from 'next/cache';
import { apiFetchInternal } from '@/lib/api-server-internal';

/**
 * Cancel the currently-pending publish (D-4b-03). DELETEs
 * `/internal/v1/catalog/publish`. Backend returns `cancelled: true` when
 * the 5s cancellation window was still open, `cancelled: false` when the
 * publish already executed. We surface that distinction via `expired`
 * so the client island can pick the right Sonner copy (success vs info).
 *
 * Layout segment is revalidated on success regardless of the cancellation
 * outcome — both states change what the sticky bar must show (Pitfall #4).
 */

export type CancelPublishActionResult =
  | { readonly ok: true; readonly cancelled: boolean; readonly expired: boolean }
  | { readonly ok: false; readonly error: string };

interface CancelBody {
  readonly cancelled: boolean;
}

export const cancelPublishAction = async (): Promise<CancelPublishActionResult> => {
  const res = await apiFetchInternal<CancelBody>('/internal/v1/catalog/publish', {
    method: 'DELETE',
  });
  if (!res.ok) {
    return { ok: false, error: 'Не удалось отменить публикацию — попробуйте снова' };
  }
  revalidatePath('/dashboard/menu', 'layout');
  const cancelled = res.data?.cancelled === true;
  return { ok: true, cancelled, expired: !cancelled };
};
