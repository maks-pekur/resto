'use server';

import { revalidatePath } from 'next/cache';
import { apiFetchInternal } from '@/lib/api-server-internal';

/**
 * Schedule a delayed publish (D-4b-03). POSTs to
 * `/internal/v1/catalog/publish`; backend starts the 5-second cancellation
 * window. On success the layout segment is revalidated so the sticky bar
 * picks up the new draft-diff on its next render (RESEARCH.md Pitfall #4).
 *
 * Russian error copy per UI-SPEC §Error states.
 */

export type SchedulePublishActionResult =
  | { readonly ok: true; readonly scheduledAt: number; readonly error: null }
  | { readonly ok: false; readonly scheduledAt: null; readonly error: string };

interface PublishScheduledBody {
  readonly scheduled: boolean;
  readonly cancelAfterMs: number;
}

export const schedulePublishAction = async (): Promise<SchedulePublishActionResult> => {
  const res = await apiFetchInternal<PublishScheduledBody>('/internal/v1/catalog/publish', {
    method: 'POST',
  });
  if (!res.ok) {
    return {
      ok: false,
      scheduledAt: null,
      error: 'Не удалось опубликовать — проверьте соединение',
    };
  }
  revalidatePath('/dashboard/menu', 'layout');
  return { ok: true, scheduledAt: Date.now(), error: null };
};
