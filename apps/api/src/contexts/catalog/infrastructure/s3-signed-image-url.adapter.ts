import {
  CopyObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV_TOKEN } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import type { ImageUrlPort } from '../domain/ports';
import { photoContentType, publicPhotoKey } from '../domain/public-photo-key';

@Injectable()
export class S3SignedImageUrlAdapter implements ImageUrlPort {
  private readonly logger = new Logger(S3SignedImageUrlAdapter.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(@Inject(ENV_TOKEN) env: Env) {
    if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
      // Structurally unreachable: env.schema supplies dev defaults matching prod-guardrails.DEV_DEFAULTS (ADR-0020 I-3).
      throw new Error('S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY are missing.');
    }

    this.bucket = env.S3_BUCKET;
    this.publicBaseUrl = env.MEDIA_PUBLIC_BASE_URL.replace(/\/+$/, '');
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      // MinIO + most S3 emulators require path-style (no wildcard DNS in dev).
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
    });
  }

  async publishPublicCopy(s3Key: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${s3Key}`,
        Key: publicPhotoKey(s3Key),
        MetadataDirective: 'REPLACE',
        ContentType: photoContentType(s3Key),
        // The key never changes for given bytes — a replaced photo is a new
        // upload with a new uuid — so the object can be cached forever.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }

  publicUrl(s3Key: string): string {
    return `${this.publicBaseUrl}/${publicPhotoKey(s3Key)}`;
  }

  async presignGet(s3Key: string, ttlSeconds: number): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: s3Key }),
        { expiresIn: ttlSeconds },
      );
    } catch (err) {
      this.logger.warn({ err, s3Key }, 'Failed to presign image URL — falling back to empty.');
      return '';
    }
  }

  // SigV4 binds ContentType + ContentLength; the browser MUST send matching headers on PUT or S3 returns 403.
  // Errors propagate (unlike presignGet, which falls back to empty string).
  async presignPut(
    s3Key: string,
    contentType: string,
    contentLength: number,
    ttlSeconds: number,
  ): Promise<string> {
    if (ttlSeconds > 600) {
      // OWASP V12: upload URL > 10 min is a misuse signal (GetPhotoUploadUrlService pins to 300s).
      this.logger.warn(
        { ttlSeconds, s3Key },
        'presignPut called with ttl > 10 min — defense check.',
      );
    }
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        ContentType: contentType,
        ContentLength: contentLength,
      }),
      { expiresIn: ttlSeconds },
    );
  }
}
