'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch } from '@/lib/api-server';

export type CancelPublishActionResult =
  | { readonly ok: true; readonly cancelled: boolean; readonly expired: boolean }
  | { readonly ok: false; readonly error: string };

interface CancelBody {
  readonly cancelled: boolean;
}

export const cancelPublishAction = async (): Promise<CancelPublishActionResult> => {
  const res = await apiFetch<CancelBody>('/v1/catalog/publish', {
    method: 'DELETE',
  });
  if (!res.ok) {
    return { ok: false, error: 'Could not cancel publication — please try again.' };
  }
  revalidatePath('/dashboard/menu', 'layout');
  const cancelled = res.data?.cancelled === true;
  return { ok: true, cancelled, expired: !cancelled };
};
