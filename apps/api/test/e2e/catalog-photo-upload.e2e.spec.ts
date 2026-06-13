import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { IMAGE_URL_PORT } from '../../src/contexts/catalog/domain/ports';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { provisionTenant, runBootstrap, signInAsOperator } from './helpers/operator-fixture';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[catalog-photo-upload.e2e] Docker not available — skipping integration tests.');
}

const INTERNAL_TOKEN = 'integration-test-token-1234567890';
const PASSWORD = 'Sup3r-Secret-Pw!';

interface AuthedTenant {
  id: string;
  slug: string;
  authed: { cookie: string; 'x-tenant-id': string };
}

const setupAuthedTenant = async (
  app: NestFastifyApplication,
  label: string,
): Promise<AuthedTenant> => {
  const slug = `${label}-${randomUUID().slice(0, 8)}`;
  const email = `owner-${randomUUID().slice(0, 8)}@example.com`;
  const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
  await runBootstrap({ tenantSlug: slug, email, password: PASSWORD, name: 'Catalog Owner' });
  const ownerCookie = await signInAsOperator(app, email, PASSWORD, tenant.id);
  return { id: tenant.id, slug, authed: { cookie: ownerCookie, 'x-tenant-id': tenant.id } };
};

const recorded: {
  s3Key: string;
  contentType: string;
  contentLength: number;
  ttl: number;
}[] = [];

suite('POST /v1/catalog/photo-upload-url — CAT-03 presigned PUT handshake', () => {
  let stack: RealStack;
  let tenantA: AuthedTenant;
  let tenantB: AuthedTenant;
  let tenantAId: string;

  beforeAll(async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';

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
    tenantA = await setupAuthedTenant(stack.app, 'photo-a');
    tenantAId = tenantA.id;
    tenantB = await setupAuthedTenant(stack.app, 'photo-b');
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('returns a 200 with uploadUrl + s3Key for a valid image/jpeg request', async () => {
    recorded.length = 0;
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/photo-upload-url',
      headers: tenantA.authed,
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
      url: '/v1/catalog/photo-upload-url',
      headers: tenantA.authed,
      payload: { contentType: 'image/png', sizeBytes: 1024 },
    });
    expect(png.statusCode).toBe(200);
    expect(png.json<{ s3Key: string }>().s3Key.endsWith('.png')).toBe(true);

    const webp = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/photo-upload-url',
      headers: tenantA.authed,
      payload: { contentType: 'image/webp', sizeBytes: 1024 },
    });
    expect(webp.statusCode).toBe(200);
    expect(webp.json<{ s3Key: string }>().s3Key.endsWith('.webp')).toBe(true);
  }, 60_000);

  it('rejects disallowed contentType with 400', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/photo-upload-url',
      headers: tenantA.authed,
      payload: { contentType: 'application/pdf', sizeBytes: 1024 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects sizeBytes over 5 MiB with 400', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/photo-upload-url',
      headers: tenantA.authed,
      payload: { contentType: 'image/jpeg', sizeBytes: 6_000_000 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects non-positive sizeBytes with 400', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/photo-upload-url',
      headers: tenantA.authed,
      payload: { contentType: 'image/jpeg', sizeBytes: 0 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/photo-upload-url',
      headers: { 'x-tenant-id': tenantAId },
      payload: { contentType: 'image/jpeg', sizeBytes: 1024 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('s3Key is bound to the calling tenant; tenant B cannot produce a key under tenant A prefix', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/photo-upload-url',
      headers: tenantB.authed,
      payload: { contentType: 'image/jpeg', sizeBytes: 1024 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ s3Key: string }>();
    expect(body.s3Key).not.toContain(tenantAId);
    expect(body.s3Key).toMatch(/^tenant\/[0-9a-f-]{36}\/menu-items\/[0-9a-f-]{36}\.jpg$/);
  }, 60_000);
});
