import { readFile } from 'node:fs/promises';
import { log } from './logger';
import type { OperatorHttpClient } from './operator-http';
import { prepareMenuPhoto } from './prepare-menu-photo';

const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PHOTO_BYTES = 5_242_880;
const MAX_COVER_BYTES = 2_097_152;
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

    const original = Buffer.from(await source.arrayBuffer());
    if (original.byteLength === 0) {
      log('seed-demo.photo.skipped', { sourceUrl, sizeBytes: original.byteLength });
      return null;
    }

    // Menu photography is shot on opaque white, which renders as a white
    // rectangle on a dark page. Alpha is the only thing that fixes it — no CSS
    // blend can tell a white background from white cheese.
    const prepared = await prepareMenuPhoto(original).catch((err: unknown) => {
      log('seed-demo.photo.unprocessed', { sourceUrl, err: String(err) });
      return original;
    });
    const body = prepared;
    const uploadContentType = prepared === original ? contentType : 'image/webp';

    if (body.byteLength > MAX_PHOTO_BYTES) {
      log('seed-demo.photo.skipped', { sourceUrl, sizeBytes: body.byteLength });
      return null;
    }

    const { uploadUrl, s3Key } = await op.post<PhotoUploadUrlResponse>(
      '/v1/catalog/photo-upload-url',
      { contentType: uploadContentType, sizeBytes: body.byteLength },
    );

    const upload = await fetch(uploadUrl, {
      method: 'PUT',
      body: new Uint8Array(body),
      headers: { 'content-type': uploadContentType },
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if (!upload.ok) {
      log('seed-demo.photo.uploadFailed', { sourceUrl, status: upload.status });
      return null;
    }

    log('seed-demo.photo.uploaded', { sourceUrl, s3Key, sizeBytes: body.byteLength });
    return s3Key;
  } catch (err) {
    log('seed-demo.photo.failed', { sourceUrl, err: String(err) });
    return null;
  }
};

/**
 * The venue photo the guest sees above the details. Uploaded whole — unlike a dish, a room is
 * not cut out of its background.
 */
const brandContentType = (file: string): string => {
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
};

export const uploadBrandCover = async (
  op: OperatorHttpClient,
  file: string,
): Promise<string | null> => {
  const sourceUrl = file;
  try {
    const contentType = brandContentType(file);
    const body = await readFile(file);
    if (body.byteLength === 0 || body.byteLength > MAX_COVER_BYTES) {
      log('seed-demo.cover.skipped', { sourceUrl, sizeBytes: body.byteLength });
      return null;
    }

    const { uploadUrl, s3Key } = await op.post<PhotoUploadUrlResponse>(
      '/v1/tenants/me/brand/logo-upload-url',
      { contentType, sizeBytes: body.byteLength },
    );
    const upload = await fetch(uploadUrl, {
      method: 'PUT',
      body: new Uint8Array(body),
      headers: { 'content-type': contentType },
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if (!upload.ok) {
      log('seed-demo.cover.uploadFailed', { sourceUrl, status: upload.status });
      return null;
    }
    log('seed-demo.cover.uploaded', { sourceUrl, s3Key, sizeBytes: body.byteLength });
    return s3Key;
  } catch (err) {
    log('seed-demo.cover.failed', { sourceUrl, err: String(err) });
    return null;
  }
};
