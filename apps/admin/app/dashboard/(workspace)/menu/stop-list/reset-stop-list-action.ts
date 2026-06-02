'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { apiFetchInternal } from '@/lib/api-server-internal';

interface StopListItemApi {
  readonly id: string;
}

export interface ResetStopListResult {
  readonly ok: boolean;
  readonly resetCount: number;
  readonly failedIds: readonly string[];
  readonly error: string | null;
}

export async function resetStopListAction(): Promise<ResetStopListResult> {
  const list = await apiFetchInternal<readonly StopListItemApi[]>('/internal/v1/catalog/stop-list');
  if (!list.ok || !list.data) {
    const t = await getTranslations('menu.stopList');
    return {
      ok: false,
      resetCount: 0,
      failedIds: [],
      error: t('resetFetchFailed'),
    };
  }

  const failedIds: string[] = [];
  let resetCount = 0;
  for (const item of list.data) {
    try {
      const res = await apiFetchInternal(`/internal/v1/catalog/stop-list/${item.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        resetCount += 1;
      } else {
        failedIds.push(item.id);
      }
    } catch {
      failedIds.push(item.id);
    }
  }

  revalidatePath('/dashboard/menu', 'layout');
  revalidatePath('/dashboard');

  return {
    ok: failedIds.length === 0,
    resetCount,
    failedIds,
    error: null,
  };
}
