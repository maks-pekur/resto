import { log } from './logger';
import type { OperatorHttpClient } from './operator-http';

const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PHOTO_BYTES = 5_242_880;
const FETCH_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 30_000;

interface PhotoUploadUrlResponse {
  readonly uploadUrl: string;
  readonly s3Key: string;
}

/**
 * Pulls a photo from a public URL and pushes it through the real operator
 * upload path (presigned PUT), so the seed exercises the same pipeline the
 * admin UI does. Returns null on any failure — a demo seed must not die
 * because a third-party CDN is unreachable.
 */
export const uploadPhotoFromUrl = async (
  op: OperatorHttpClient,
  sourceUrl: string,
): Promise<string | null> => {
  try {
    const source = await fetch(sourceUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!source.ok) {
      log('seed-demo.photo.skipped', { sourceUrl, status: source.status });
      return null;
    }

    const contentType = (source.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      log('seed-demo.photo.skipped', { sourceUrl, contentType });
      return null;
    }

    const bytes = new Uint8Array(await source.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES) {
      log('seed-demo.photo.skipped', { sourceUrl, sizeBytes: bytes.byteLength });
      return null;
    }

    const { uploadUrl, s3Key } = await op.post<PhotoUploadUrlResponse>(
      '/v1/catalog/photo-upload-url',
      { contentType, sizeBytes: bytes.byteLength },
    );

    const upload = await fetch(uploadUrl, {
      method: 'PUT',
      body: bytes,
      headers: { 'content-type': contentType },
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if (!upload.ok) {
      log('seed-demo.photo.uploadFailed', { sourceUrl, status: upload.status });
      return null;
    }

    log('seed-demo.photo.uploaded', { sourceUrl, s3Key, sizeBytes: bytes.byteLength });
    return s3Key;
  } catch (err) {
    log('seed-demo.photo.failed', { sourceUrl, err: String(err) });
    return null;
  }
};
