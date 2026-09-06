import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { BRAND_MEDIA_PORT, type BrandMediaPort } from '../domain/ports';
import type { BrandLogoUploadUrlInput } from './dto';

const EXTENSION: Readonly<Record<BrandLogoUploadUrlInput['contentType'], string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

@Injectable()
export class GetBrandLogoUploadUrlService {
  // OWASP V12: the URL must not outlive the interaction that asked for it.
  private static readonly TTL_SECONDS = 300;

  constructor(@Inject(BRAND_MEDIA_PORT) private readonly media: BrandMediaPort) {}

  async execute(input: BrandLogoUploadUrlInput): Promise<{ uploadUrl: string; s3Key: string }> {
    const ctx = requireTenantContext();
    // The tenant prefix is set server-side so a leaked URL cannot overwrite another tenant's logo.
    const s3Key = `tenant/${ctx.tenantId}/brand/${randomUUID()}.${EXTENSION[input.contentType]}`;
    const uploadUrl = await this.media.presignPut(
      s3Key,
      input.contentType,
      input.sizeBytes,
      GetBrandLogoUploadUrlService.TTL_SECONDS,
    );
    return { uploadUrl, s3Key };
  }
}
