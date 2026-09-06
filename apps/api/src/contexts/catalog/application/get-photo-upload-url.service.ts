import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { IMAGE_URL_PORT, type ImageUrlPort } from '../domain/ports';
import type { PhotoUploadUrlInput } from './dto';

@Injectable()
export class GetPhotoUploadUrlService {
  // OWASP V12: upload URL TTL must not outlive a single drag-drop interaction.
  private static readonly TTL_SECONDS = 300;

  constructor(@Inject(IMAGE_URL_PORT) private readonly images: ImageUrlPort) {}

  async execute(input: PhotoUploadUrlInput): Promise<{ uploadUrl: string; s3Key: string }> {
    const ctx = requireTenantContext();
    const ext = contentTypeToExtension(input.contentType);
    // Server-side tenant key prefix prevents cross-tenant overwrite via a leaked token (T-04b-03-02).
    // T-10.6-07-01: prefix is chosen from the validated `kind` enum, never a client-supplied string.
    const prefix = input.kind === 'ingredient' ? 'ingredients' : 'menu-items';
    const s3Key = `tenant/${ctx.tenantId}/${prefix}/${randomUUID()}.${ext}`;
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
