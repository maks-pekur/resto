import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
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

if (!dockerOk) {
  console.warn('[menu-brand-response.e2e] Docker not available — skipping.');
}

const PASSWORD = 'Sup3r-Secret-Pw!';

suite('GET /v1/menu — brand object in response', () => {
  let stack: RealStack;
  let tenantId: string;
  let brandId: string;
  let tenantSlug: string;
  let brandSlug: string;
  let tenantHost: string;
  let brandHost: string;

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
              Promise.resolve(`https://signed.test/${key}?expires=${ttl.toString()}`),
          },
        },
      ],
    });

    tenantId = randomUUID();
    brandId = randomUUID();
    tenantSlug = `res154-tenant-${randomUUID().slice(0, 8)}`;
    brandSlug = `res154-brand-${randomUUID().slice(0, 8)}`;
    tenantHost = `${tenantSlug}.menu.resto.app`;
    brandHost = `${brandSlug}.menu.resto.app`;
    const db = stack.app.get(TenantAwareDb);

    await db.withoutTenant('seed brand for menu-brand-response e2e', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: tenantId,
        slug: tenantSlug,
        displayName: 'RES-154 Tenant',
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
        displayName: 'RES-154 Brand',
        theme: { logoUrl: 'https://cdn.example/r154.png', primaryColor: '#FF5733', font: 'Inter' },
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
    await runBootstrap({ tenantSlug, email, password: PASSWORD, name: 'RES-154 Owner' });
    const ownerCookie = await signInAsOperator(stack.app, email, PASSWORD, tenantId);
    const authed = { cookie: ownerCookie, 'x-tenant-id': tenantId, 'x-brand-slug': brandSlug };

    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: authed,
      payload: { slug: 'mains', name: { en: 'Mains' }, sortOrder: 0 },
    });
    if (categoryRes.statusCode !== 200) {
      throw new Error(
        `category seed failed: ${categoryRes.statusCode.toString()} ${categoryRes.body}`,
      );
    }
    const categoryId = categoryRes.json<{ id: string }>().id;

    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: authed,
      payload: {
        categoryId,
        slug: 'classic',
        name: { en: 'Classic' },
        basePrice: '9.99',
        currency: 'USD',
        status: 'published',
      },
    });
    if (itemRes.statusCode !== 200) {
      throw new Error(`item seed failed: ${itemRes.statusCode.toString()} ${itemRes.body}`);
    }

    const publishRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/publish',
      headers: authed,
    });
    if (publishRes.statusCode !== 200) {
      throw new Error(`publish failed: ${publishRes.statusCode.toString()} ${publishRes.body}`);
    }
  }, 240_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('returns brand id, slug, displayName, and theme on the brand subdomain', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: brandHost },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      brand: {
        id: string;
        slug: string;
        displayName: string;
        theme: { logoUrl: string | null; primaryColor: string | null; font: string | null } | null;
      } | null;
      items: {
        slug: string;
        imageUrl: string | null;
        photos: { s3Key: string; url: string; sortOrder: number }[];
        proteins: string | null;
        sizes: unknown[];
      }[];
      modifierGroups: unknown[];
    }>();
    expect(body.brand).toEqual({
      id: brandId,
      slug: brandSlug,
      displayName: 'RES-154 Brand',
      theme: { logoUrl: 'https://cdn.example/r154.png', primaryColor: '#FF5733', font: 'Inter' },
    });
    // D-4a-09: public DTO carries the new fields automatically.
    expect(body).toHaveProperty('modifierGroups');
    // Brand-scoped read may filter out items not tagged to this brand; the
    // shape check is enough — the item shape itself is exercised by the
    // catalog.e2e tenant-scoped reads.
  }, 60_000);

  it('returns 404 when the request resolves a tenant without a brand', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: tenantHost },
    });
    expect(res.statusCode).toBe(404);
  }, 60_000);
});
