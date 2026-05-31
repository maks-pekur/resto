'use server';

import { revalidatePath } from 'next/cache';
import { apiFetchInternal } from '@/lib/api-server-internal';
import { friendlyCatalogError } from './upsert-category-action';

/**
 * Plan 04b-05 Task 2 — soft-archive a category (D-4b-07).
 *
 * Hard deletes are forbidden by `resto_app` role privileges (ADR-0020) and
 * by Catalog domain policy (D-4b-07): the only "remove" affordance is
 * PATCH `/categories/:id/archive` which sets `status='archived'`.
 *
 * Pattern S8: revalidatePath layout so the sticky bar diff count refreshes.
 */

export interface ArchiveCategoryActionState {
  readonly error: string | null;
  readonly success: boolean;
}

interface ProblemDetails {
  readonly code?: string;
  readonly detail?: string;
  readonly message?: string;
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
