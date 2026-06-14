import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { schema, TenantAwareDb } from '@resto/db';
import { IMAGE_URL_PORT } from '../../src/contexts/catalog/domain/ports';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { runBootstrap, signInAsOperator } from './helpers/operator-fixture';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;
if (!dockerOk) console.warn('[catalog-presign-degraded.e2e] Docker not available — skipping.');

const PASSWORD = 'Sup3r-Secret-Pw!';

suite('GET /v1/menu — degraded image presign (AUDIT #20)', () => {
  let stack: RealStack;
  let brandHost: string;
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
          // Simulate an S3 outage: presignGet falls back to '' (degraded mode).
          useValue: { presignGet: (): Promise<string> => Promise.resolve('') },
        },
      ],
    });

    const tenantId = randomUUID();
    const brandId = randomUUID();
    const tenantSlug = `presign-t-${randomUUID().slice(0, 8)}`;
    const brandSlug = `presign-b-${randomUUID().slice(0, 8)}`;
    const tenantHost = `${tenantSlug}.menu.resto.app`;
    brandHost = `${brandSlug}.menu.resto.app`;
    itemSlug = 'classic';
    const db = stack.app.get(TenantAwareDb);

    await db.withoutTenant('seed brand for presign-degraded e2e', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: tenantId,
        slug: tenantSlug,
        displayName: 'Presign Tenant',
        locale: 'en',
        defaultCurrency: 'USD',
      });
      await tx.insert(schema.tenantDomains).values({
        tenantId,
        domain: tenantHost,
        kind: 'subdomain',
        isPrimary: true,
      });
      await tx.insert(schema.brands).values({
        id: brandId,
        tenantId,
        slug: brandSlug,
        displayName: 'Presign Brand',
      });
      await tx.insert(schema.brandDomains).values({
        brandId,
        tenantId,
        domain: brandHost,
        kind: 'subdomain',
        isPrimary: true,
      });
    });

    const email = `owner-${randomUUID().slice(0, 8)}@example.com`;
    await runBootstrap({ tenantSlug, email, password: PASSWORD, name: 'Presign Owner' });
    const ownerCookie = await signInAsOperator(stack.app, email, PASSWORD, tenantId);
    const authed = { cookie: ownerCookie, 'x-tenant-id': tenantId, 'x-brand-slug': brandSlug };

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

  it('drops a photo whose presign failed and reports imageUrl as null, not an empty string', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: brandHost },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      items: { slug: string; imageUrl: string | null; photos: { url: string }[] }[];
    }>();
    const item = body.items.find((i) => i.slug === itemSlug);
    expect(item).toBeDefined();
    expect(item?.imageUrl).toBeNull();
    expect(item?.photos).toEqual([]);
  }, 60_000);
});
