import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSignedUrlMock = vi.fn<(...args: unknown[]) => Promise<string>>();
const putObjectCommandSpy = vi.fn<(input: Record<string, unknown>) => Record<string, unknown>>();
const getObjectCommandSpy = vi.fn<(input: Record<string, unknown>) => Record<string, unknown>>();

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...args),
}));

const copyObjectCommandSpy = vi.fn<(input: Record<string, unknown>) => Record<string, unknown>>();
const sendMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    tag: 's3-client-stub',
    send: (...args: unknown[]) => sendMock(...args),
  })),
  CopyObjectCommand: vi.fn().mockImplementation((input: Record<string, unknown>) => {
    copyObjectCommandSpy(input);
    return { kind: 'CopyObjectCommand', ...input };
  }),
  PutObjectCommand: vi.fn().mockImplementation((input: Record<string, unknown>) => {
    putObjectCommandSpy(input);
    return { kind: 'PutObjectCommand', ...input };
  }),
  GetObjectCommand: vi.fn().mockImplementation((input: Record<string, unknown>) => {
    getObjectCommandSpy(input);
    return { kind: 'GetObjectCommand', ...input };
  }),
}));

import { S3SignedImageUrlAdapter } from '../../../src/contexts/catalog/infrastructure/s3-signed-image-url.adapter';
import type { Env } from '../../../src/config/env.schema';

const buildEnv = (overrides: Partial<Env> = {}): Env =>
  ({
    NODE_ENV: 'test',
    S3_ENDPOINT: 'http://localhost:9000',
    MEDIA_PUBLIC_BASE_URL: 'http://localhost:9000/resto-dev',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'resto-test',
    S3_ACCESS_KEY: 'minio',
    S3_SECRET_KEY: 'minio_dev_password',
    ...overrides,
  }) as Env;

describe('S3SignedImageUrlAdapter.presignPut', () => {
  beforeEach(() => {
    getSignedUrlMock.mockReset();
    putObjectCommandSpy.mockReset();
    getObjectCommandSpy.mockReset();
  });

  it('returns a non-empty presigned URL and forwards Bucket, Key, ContentType, ContentLength to PutObjectCommand', async () => {
    getSignedUrlMock.mockResolvedValueOnce('https://signed.example/put?token=abc');
    const adapter = new S3SignedImageUrlAdapter(buildEnv({ S3_BUCKET: 'resto-test' }));

    const url = await adapter.presignPut('tenant/abc/menu-items/123', 'image/jpeg', 12_345, 300);

    expect(url).toBe('https://signed.example/put?token=abc');
    expect(putObjectCommandSpy).toHaveBeenCalledTimes(1);
    expect(putObjectCommandSpy).toHaveBeenCalledWith({
      Bucket: 'resto-test',
      Key: 'tenant/abc/menu-items/123',
      ContentType: 'image/jpeg',
      ContentLength: 12_345,
    });
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
    const firstCall = getSignedUrlMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const opts = firstCall?.[2];
    expect(opts).toEqual({ expiresIn: 300 });
  });

  it('propagates SDK errors from getSignedUrl (no silent fallback to empty string)', async () => {
    const sdkError = new Error('SignatureDoesNotMatch');
    getSignedUrlMock.mockRejectedValueOnce(sdkError);
    const adapter = new S3SignedImageUrlAdapter(buildEnv());

    await expect(
      adapter.presignPut('tenant/abc/menu-items/123', 'image/jpeg', 12_345, 300),
    ).rejects.toThrow('SignatureDoesNotMatch');
  });

  it('still presigns GET via presignGet (existing behaviour unchanged)', async () => {
    getSignedUrlMock.mockResolvedValueOnce('https://signed.example/get?token=xyz');
    const adapter = new S3SignedImageUrlAdapter(buildEnv());

    const url = await adapter.presignGet('tenant/abc/menu-items/123', 300);

    expect(url).toBe('https://signed.example/get?token=xyz');
    expect(getObjectCommandSpy).toHaveBeenCalledWith({
      Bucket: 'resto-test',
      Key: 'tenant/abc/menu-items/123',
    });
  });
});

describe('S3SignedImageUrlAdapter — published media', () => {
  const KEY = 'tenant/11111111-1111-4111-8111-111111111111/menu-items/abc.webp';

  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue(undefined);
    copyObjectCommandSpy.mockReset();
    getSignedUrlMock.mockReset();
  });

  it('addresses a published photo without signing it', () => {
    const url = new S3SignedImageUrlAdapter(buildEnv()).publicUrl(KEY);
    expect(url).toBe(`http://localhost:9000/resto-dev/public/${KEY}`);
    expect(url).not.toContain('X-Amz-Signature');
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it('tolerates a base url with a trailing slash', () => {
    const env = buildEnv({ MEDIA_PUBLIC_BASE_URL: 'https://cdn.example.test/' });
    expect(new S3SignedImageUrlAdapter(env).publicUrl(KEY)).toBe(
      `https://cdn.example.test/public/${KEY}`,
    );
  });

  it('copies into the public prefix and stamps the object immutable', async () => {
    await new S3SignedImageUrlAdapter(buildEnv()).publishPublicCopy(KEY);

    expect(copyObjectCommandSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'resto-test',
        CopySource: `resto-test/${KEY}`,
        Key: `public/${KEY}`,
        CacheControl: 'public, max-age=31536000, immutable',
        ContentType: 'image/webp',
      }),
    );
  });
});
