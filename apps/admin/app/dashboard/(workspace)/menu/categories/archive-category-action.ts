'use server';

import { revalidatePath } from 'next/cache';
import { apiFetchInternal } from '@/lib/api-server-internal';
import { friendlyCatalogError, type ProblemDetails } from '@/lib/menu/catalog-errors';

export interface ArchiveCategoryActionState {
  readonly error: string | null;
  readonly success: boolean;
}

export async function archiveCategoryAction(
  _prev: ArchiveCategoryActionState,
  input: { readonly id: string },
): Promise<ArchiveCategoryActionState> {
  const res = await apiFetchInternal<unknown>(
    `/internal/v1/catalog/categories/${input.id}/archive`,
    { method: 'PATCH' },
  );
  if (!res.ok) {
    return {
      error: friendlyCatalogError(res.status, res.data as ProblemDetails | null),
      success: false,
    };
  }
  revalidatePath('/dashboard/menu', 'layout');
  return { error: null, success: true };
}
