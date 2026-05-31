import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSignedUrlMock = vi.fn<(...args: unknown[]) => Promise<string>>();
const putObjectCommandSpy = vi.fn<(input: Record<string, unknown>) => Record<string, unknown>>();
const getObjectCommandSpy = vi.fn<(input: Record<string, unknown>) => Record<string, unknown>>();

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...args),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ tag: 's3-client-stub' })),
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
