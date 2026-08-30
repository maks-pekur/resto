import { CopyObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import { ENV_TOKEN } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import type { BrandMediaPort } from '../domain/ports';

const PUBLIC_PREFIX = 'public/';

const CONTENT_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

@Injectable()
export class S3BrandMediaAdapter implements BrandMediaPort {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(@Inject(ENV_TOKEN) env: Env) {
    if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
      // Structurally unreachable: env.schema supplies dev defaults matching prod guardrails.
      throw new Error('S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY are missing.');
    }
    this.bucket = env.S3_BUCKET;
    this.publicBaseUrl = env.MEDIA_PUBLIC_BASE_URL.replace(/\/+$/u, '');
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });
  }

  presignPut(
    s3Key: string,
    contentType: string,
    contentLength: number,
    ttlSeconds: number,
  ): Promise<string> {
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

  async publish(s3Key: string): Promise<string> {
    const publicKey = `${PUBLIC_PREFIX}${s3Key}`;
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${s3Key}`,
        Key: publicKey,
        MetadataDirective: 'REPLACE',
        ContentType: contentTypeOf(s3Key),
        // A replaced logo is a new upload under a new uuid, so these bytes never change.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return `${this.publicBaseUrl}/${publicKey}`;
  }
}

const contentTypeOf = (s3Key: string): string =>
  CONTENT_TYPE_BY_EXTENSION[s3Key.slice(s3Key.lastIndexOf('.') + 1).toLowerCase()] ??
  'application/octet-stream';
