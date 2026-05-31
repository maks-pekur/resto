import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { IMAGE_URL_PORT, type ImageUrlPort } from '../domain/ports';
import type { PhotoUploadUrlInput } from './dto';

/**
 * Phase 4b CAT-03: presigned PUT handshake for direct-from-browser photo
 * upload. The operator never picks the S3 key — it is server-generated as
 * `tenant/${tenantId}/menu-items/${uuid}.${ext}` so an attacker presenting
 * a token from tenant A cannot overwrite a key under tenant B (T-04b-03-02
 * Tampering mitigation, see PLAN threat model).
 *
 * The presigned URL TTL is pinned to 5 minutes per OWASP V12 — long enough
 * for the operator to drag-drop a photo, short enough that an exfiltrated
 * URL is useless by the time it reaches an attacker.
 */
@Injectable()
export class GetPhotoUploadUrlService {
  // Per CAT-03 / OWASP V12: upload URLs must not outlive the operator's
  // single drag-drop interaction.
  private static readonly TTL_SECONDS = 300;

  constructor(@Inject(IMAGE_URL_PORT) private readonly images: ImageUrlPort) {}

  async execute(input: PhotoUploadUrlInput): Promise<{ uploadUrl: string; s3Key: string }> {
    const ctx = requireTenantContext();
    const ext = contentTypeToExtension(input.contentType);
    // Tenant-scoped key prefix: the bucket policy + ScopedTx + RLS already
    // segregate database writes; the S3 key prefix is the third line of
    // isolation so cross-tenant key collision is structurally impossible.
    const s3Key = `tenant/${ctx.tenantId}/menu-items/${randomUUID()}.${ext}`;
    const uploadUrl = await this.images.presignPut(
      s3Key,
      input.contentType,
      input.sizeBytes,
      GetPhotoUploadUrlService.TTL_SECONDS,
    );
    return { uploadUrl, s3Key };
  }
}

const contentTypeToExtension = (contentType: PhotoUploadUrlInput['contentType']): string => {
  switch (contentType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
  }
};
