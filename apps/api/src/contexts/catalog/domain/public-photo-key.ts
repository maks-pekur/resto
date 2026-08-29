const PUBLIC_PREFIX = 'public/';

/**
 * Where a published copy of an uploaded photo lives.
 *
 * Deriving it from the private key rather than storing a second column keeps the
 * two in step by construction, and keeps the tenant in the path so an erasure can
 * drop a tenant's published media by prefix.
 */
export const publicPhotoKey = (s3Key: string): string =>
  s3Key.startsWith(PUBLIC_PREFIX) ? s3Key : `${PUBLIC_PREFIX}${s3Key}`;

export const isPublicPhotoKey = (s3Key: string): boolean => s3Key.startsWith(PUBLIC_PREFIX);

const CONTENT_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** The upload names the object after the content type it declared, so the
 * extension is authoritative. Needed because copying with MetadataDirective
 * REPLACE drops the type and S3 falls back to binary/octet-stream. */
export const photoContentType = (s3Key: string): string => {
  const extension = s3Key.slice(s3Key.lastIndexOf('.') + 1).toLowerCase();
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream';
};
