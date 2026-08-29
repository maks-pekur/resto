import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { schema, TenantAwareDb } from '@resto/db';
import { IMAGE_URL_PORT } from '../../src/contexts/catalog/domain/ports';
import { publicPhotoKey } from '../../src/contexts/catalog/domain/public-photo-key';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { runBootstrap, signInAsOperator } from './helpers/operator-fixture';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;
if (!dockerOk) console.warn('[catalog-public-photo-url.e2e] Docker not available — skipping.');

const PASSWORD = 'Sup3r-Secret-Pw!';

suite('GET /v1/menu — published photos survive an S3 outage (AUDIT #20)', () => {
  let stack: RealStack;
  let tenantHost: string;
  let itemSlug: string;

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
          // Publish succeeded while S3 was healthy; S3 is unreachable by the time
          // the guest reads. The read path must not care — the URL is derived.
          useValue: {
            publishPublicCopy: (): Promise<void> => Promise.resolve(),
            publicUrl: (s3Key: string): string =>
              `https://cdn.example.test/${publicPhotoKey(s3Key)}`,
            presignGet: (): Promise<string> => Promise.reject(new Error('S3 unreachable')),
            presignPut: (): Promise<string> => Promise.reject(new Error('S3 unreachable')),
          },
        },
      ],
    });

    const tenantId = randomUUID();
    const tenantSlug = `presign-t-${randomUUID().slice(0, 8)}`;
    tenantHost = `${tenantSlug}.menu.resto.app`;
    itemSlug = 'classic';
    const db = stack.app.get(TenantAwareDb);

    await db.withoutTenant('seed tenant for presign-degraded e2e', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: tenantId,
        slug: tenantSlug,
        displayName: 'Presign Tenant',
        locale: 'en',
        country: 'GB',
        defaultCurrency: 'USD',
      });
      await tx.insert(schema.tenantDomains).values({
        tenantId,
        domain: tenantHost,
        kind: 'subdomain',
        isPrimary: true,
      });
    });

    const email = `owner-${randomUUID().slice(0, 8)}@example.com`;
    await runBootstrap({ tenantSlug, email, password: PASSWORD, name: 'Presign Owner' });
    const ownerCookie = await signInAsOperator(stack.app, email, PASSWORD, tenantId);
    const authed = { cookie: ownerCookie, 'x-tenant-id': tenantId };

    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: authed,
      payload: { slug: 'mains', name: { en: 'Mains' }, sortOrder: 0 },
    });
    expect(categoryRes.statusCode).toBe(200);
    const categoryId = categoryRes.json<{ id: string }>().id;

    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: authed,
      payload: {
        categoryId,
        slug: itemSlug,
        name: { en: 'Classic' },
        basePrice: '9.99',
        currency: 'USD',
        status: 'published',
      },
    });
    expect(itemRes.statusCode).toBe(200);
    const itemId = itemRes.json<{ id: string }>().id;

    await db.withoutTenant('attach a photo to the item', (tx) =>
      tx
        .update(schema.menuItems)
        .set({ photos: [{ s3Key: `tenant/${tenantId}/menu-items/${itemId}.jpg`, sortOrder: 0 }] })
        .where(eq(schema.menuItems.id, itemId)),
    );

    const publishRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/publish',
      headers: authed,
    });
    expect(publishRes.statusCode).toBe(200);
  }, 240_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('serves the photo from its stable public address, with S3 unreachable', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: tenantHost },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      items: { slug: string; imageUrl: string | null; photos: { url: string }[] }[];
    }>();
    const item = body.items.find((i) => i.slug === itemSlug);
    expect(item).toBeDefined();
    expect(item?.imageUrl).toContain('https://cdn.example.test/public/tenant/');
    expect(item?.photos).toHaveLength(1);
    expect(item?.imageUrl).not.toContain('X-Amz-Signature');
  }, 60_000);
});
