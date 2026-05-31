import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV_TOKEN } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import type { ImageUrlPort } from '../domain/ports';

@Injectable()
export class S3SignedImageUrlAdapter implements ImageUrlPort {
  private readonly logger = new Logger(S3SignedImageUrlAdapter.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(ENV_TOKEN) env: Env) {
    if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
      // Structurally unreachable: env.schema supplies dev defaults matching prod-guardrails.DEV_DEFAULTS (ADR-0020 I-3).
      throw new Error('S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY are missing.');
    }

    this.bucket = env.S3_BUCKET;
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
