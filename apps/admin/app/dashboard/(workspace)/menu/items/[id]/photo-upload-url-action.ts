'use server';

import { getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api-server';
import { friendlyCatalogError, type ProblemDetails } from '@/lib/menu/catalog-errors';

interface PhotoUploadUrlResponse {
  readonly uploadUrl: string;
  readonly s3Key: string;
}

export type PhotoUploadUrlActionResult =
  | { readonly ok: true; readonly uploadUrl: string; readonly s3Key: string }
  | { readonly ok: false; readonly error: string };

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function photoUploadUrlAction(
  contentType: string,
  sizeBytes: number,
): Promise<PhotoUploadUrlActionResult> {
  if (!ALLOWED_TYPES.has(contentType) || sizeBytes > MAX_SIZE_BYTES) {
    const t = await getTranslations('menu.editor');
    return { ok: false, error: t('photoAllowlistError') };
  }

  const res = await apiFetch<PhotoUploadUrlResponse>('/v1/catalog/photo-upload-url', {
    method: 'POST',
    body: { contentType, sizeBytes },
  });
  if (!res.ok || !res.data) {
    return {
      ok: false,
      error: friendlyCatalogError(res.status, res.data as ProblemDetails | null),
    };
  }
  return { ok: true, uploadUrl: res.data.uploadUrl, s3Key: res.data.s3Key };
}
