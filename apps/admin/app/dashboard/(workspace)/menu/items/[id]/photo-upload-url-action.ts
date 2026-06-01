'use server';

import { apiFetchInternal } from '@/lib/api-server-internal';
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
  if (!ALLOWED_TYPES.has(contentType)) {
    return { ok: false, error: 'Только JPG, PNG или WEBP до 5 МБ.' };
  }
  if (sizeBytes > MAX_SIZE_BYTES) {
    return { ok: false, error: 'Только JPG, PNG или WEBP до 5 МБ.' };
  }

  const res = await apiFetchInternal<PhotoUploadUrlResponse>(
    '/internal/v1/catalog/photo-upload-url',
    { method: 'POST', body: { contentType, sizeBytes } },
  );
  if (!res.ok || !res.data) {
    return {
      ok: false,
      error: friendlyCatalogError(res.status, res.data as ProblemDetails | null),
    };
  }
  return { ok: true, uploadUrl: res.data.uploadUrl, s3Key: res.data.s3Key };
}
