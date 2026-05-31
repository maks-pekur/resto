import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV_TOKEN } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import type { ImageUrlPort } from '../domain/ports';

/**
 * Presigns GET URLs for menu images on a private S3-compatible bucket.
 *
 * In production: AWS S3 / Cloudflare R2 (driven by the hosting ADR).
 * In development: MinIO at `http://localhost:9000`. Sigv4 + path-style
 * addressing keeps the same code path on both — only the endpoint and
 * credentials change.
 *
 * `getSignedUrl` is a pure CPU operation (no network round-trip). The
 * service can call it per-item per-request without latency cost.
 */
@Injectable()
export class S3SignedImageUrlAdapter implements ImageUrlPort {
  private readonly logger = new Logger(S3SignedImageUrlAdapter.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(ENV_TOKEN) env: Env) {
    if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
      throw new Error(
        'S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY are missing. env.schema ' +
          'now supplies dev defaults (matching `prod-guardrails.DEV_DEFAULTS`) ' +
          'so this branch is structurally unreachable; reaching it indicates ' +
          'the schema was rolled back. ADR-0020 I-3.',
      );
    }

    this.bucket = env.S3_BUCKET;
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      // MinIO and most S3 emulators require path-style addressing —
      // virtual-hosted style assumes a wildcard DNS we do not run in dev.
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

  // Phase 4b CAT-03: presign a PUT for browser direct-upload. SigV4 binds
  // ContentType + ContentLength into the signature so the browser MUST send
  // matching headers on PUT (mismatch → 403 from S3). PUT errors propagate
  // — the caller surfaces 5xx and the UI shows a real failure (different
  // from presignGet, where an empty string falls through to a placeholder).
  async presignPut(
    s3Key: string,
    contentType: string,
    contentLength: number,
    ttlSeconds: number,
  ): Promise<string> {
    if (ttlSeconds > 600) {
      // OWASP V12: presigned-upload URLs should live no longer than the
      // operator's interaction window. >10 min is a misuse signal —
      // GetPhotoUploadUrlService pins this to 300s.
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
