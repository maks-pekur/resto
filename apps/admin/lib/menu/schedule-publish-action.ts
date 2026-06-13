'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch } from '@/lib/api-server';

export type SchedulePublishActionResult =
  | { readonly ok: true; readonly scheduledAt: number; readonly error: null }
  | { readonly ok: false; readonly scheduledAt: null; readonly error: string };

interface PublishScheduledBody {
  readonly scheduled: boolean;
  readonly cancelAfterMs: number;
}

export const schedulePublishAction = async (): Promise<SchedulePublishActionResult> => {
  const res = await apiFetch<PublishScheduledBody>('/v1/catalog/publish', {
    method: 'POST',
  });
  if (!res.ok) {
    return {
      ok: false,
      scheduledAt: null,
      error: 'Could not publish — check your connection.',
    };
  }
  revalidatePath('/dashboard/menu', 'layout');
  return { ok: true, scheduledAt: Date.now(), error: null };
};
