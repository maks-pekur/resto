import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { IMAGE_URL_PORT } from '../../src/contexts/catalog/domain/ports';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[catalog-photo-upload.e2e] Docker not available — skipping integration tests.');
}

const INTERNAL_TOKEN = 'integration-test-token-1234567890';

const provisionTenant = async (
  app: NestFastifyApplication,
  body: { slug: string; displayName: string },
): Promise<{ id: string; primaryDomain: string }> => {
  const res = await app.inject({
    method: 'POST',
    url: '/internal/v1/tenants',
    headers: { 'x-internal-token': INTERNAL_TOKEN },
    payload: { ...body, defaultCurrency: 'USD', locale: 'en' },
  });
  if (res.statusCode !== 201) {
    throw new Error(`provisionTenant failed: ${res.statusCode.toString()} ${res.body}`);
  }
  return res.json();
};

// Deterministic stub: records the inputs presignPut was called with so the
// spec can assert ttlSeconds + tenant-scoped key shape without reaching for
// MinIO. The presignGet leg keeps existing catalog-reads tests stable.
const recorded: {
  s3Key: string;
  contentType: string;
  contentLength: number;
  ttl: number;
}[] = [];

suite('POST /internal/v1/catalog/photo-upload-url — CAT-03 presigned PUT handshake', () => {
  let stack: RealStack;
  let tenantAId: string;

  beforeAll(async () => {
    stack = await startRealStack({
      natsEnabledInApp: false,
      overrideProviders: [
        {
          provide: IMAGE_URL_PORT,
          useValue: {
            presignGet: (key: string, ttl: number): Promise<string> =>
              Promise.resolve(`https://signed.test/get/${key}?expires=${ttl.toString()}`),
            presignPut: (
              key: string,
              contentType: string,
              contentLength: number,
              ttl: number,
            ): Promise<string> => {
              recorded.push({ s3Key: key, contentType, contentLength, ttl });
              return Promise.resolve(
                `https://signed.test/put/${key}?type=${contentType}&len=${contentLength.toString()}&expires=${ttl.toString()}`,
              );
            },
          },
        },
      ],
    });
    const tenantA = await provisionTenant(stack.app, {
      slug: 'photo-a',
      displayName: 'Photo Tenant A',
    });
    tenantAId = tenantA.id;
    await provisionTenant(stack.app, { slug: 'photo-b', displayName: 'Photo Tenant B' });
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('returns a 200 with uploadUrl + s3Key for a valid image/jpeg request', async () => {
    recorded.length = 0;
    const res = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/photo-upload-url',
      headers: { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'photo-a' },
      payload: { contentType: 'image/jpeg', sizeBytes: 12_345 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ uploadUrl: string; s3Key: string }>();
    expect(body.uploadUrl).toMatch(/^https:\/\/signed\.test\/put\//);
    expect(body.s3Key).toMatch(new RegExp(`^tenant/${tenantAId}/menu-items/[0-9a-f-]{36}\\.jpg$`));
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.contentType).toBe('image/jpeg');
    expect(recorded[0]?.contentLength).toBe(12_345);
    expect(recorded[0]?.ttl).toBe(300);
  }, 60_000);

  it('uses the correct extension for image/png and image/webp', async () => {
    const png = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/photo-upload-url',
      headers: { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'photo-a' },
      payload: { contentType: 'image/png', sizeBytes: 1024 },
    });
    expect(png.statusCode).toBe(200);
    expect(png.json<{ s3Key: string }>().s3Key.endsWith('.png')).toBe(true);

    const webp = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/photo-upload-url',
      headers: { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'photo-a' },
      payload: { contentType: 'image/webp', sizeBytes: 1024 },
    });
    expect(webp.statusCode).toBe(200);
    expect(webp.json<{ s3Key: string }>().s3Key.endsWith('.webp')).toBe(true);
  }, 60_000);

  it('rejects disallowed contentType with 400', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/photo-upload-url',
      headers: { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'photo-a' },
      payload: { contentType: 'application/pdf', sizeBytes: 1024 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects sizeBytes over 5 MiB with 400', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/photo-upload-url',
      headers: { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'photo-a' },
      payload: { contentType: 'image/jpeg', sizeBytes: 6_000_000 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects non-positive sizeBytes with 400', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/photo-upload-url',
      headers: { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'photo-a' },
      payload: { contentType: 'image/jpeg', sizeBytes: 0 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects request without x-internal-token with 401', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/photo-upload-url',
      headers: { 'x-tenant-slug': 'photo-a' },
      payload: { contentType: 'image/jpeg', sizeBytes: 1024 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('s3Key is bound to the calling tenant; tenant B cannot produce a key under tenant A prefix', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/photo-upload-url',
      headers: { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'photo-b' },
      payload: { contentType: 'image/jpeg', sizeBytes: 1024 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ s3Key: string }>();
    expect(body.s3Key).not.toContain(tenantAId);
    expect(body.s3Key).toMatch(/^tenant\/[0-9a-f-]{36}\/menu-items\/[0-9a-f-]{36}\.jpg$/);
  }, 60_000);
});
