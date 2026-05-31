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
  console.warn('[catalog.e2e] Docker not available — skipping integration tests.');
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

suite('Catalog — internal write → public read → cross-tenant isolation', () => {
  let stack: RealStack;

  beforeAll(async () => {
    stack = await startRealStack({
      // Catalog tests don't exercise the event publish path; the broker
      // container is still started by the harness, but the api skips
      // wiring its NATS publisher.
      natsEnabledInApp: false,
      overrideProviders: [
        {
          provide: IMAGE_URL_PORT,
          // Don't reach for MinIO in tests — produce a deterministic
          // signed URL so the assertion stays focused on "raw key
          // never leaks".
          useValue: {
            presignGet: (key: string, ttl: number): Promise<string> =>
              Promise.resolve(`https://signed.test/${key}?expires=${ttl.toString()}`),
          },
        },
      ],
    });
    await provisionTenant(stack.app, { slug: 'cafe-a', displayName: 'Cafe A' });
    // Tenant B exists so the cross-tenant test has a host to send requests against.
    await provisionTenant(stack.app, { slug: 'cafe-b', displayName: 'Cafe B' });
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('operator with internal token can upsert + publish, and the public menu surfaces the item', async () => {
    const internalAuth = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'cafe-a' };

    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: internalAuth,
      payload: { slug: 'pizza', name: { en: 'Pizza' }, sortOrder: 0 },
    });
    expect(categoryRes.statusCode).toBe(200);
    const categoryId = categoryRes.json<{ id: string }>().id;

    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/items',
      headers: internalAuth,
      payload: {
        categoryId,
        slug: 'margherita',
        name: { en: 'Margherita' },
        basePrice: '12.50',
        currency: 'USD',
        photos: [{ s3Key: 'menu/margherita.webp', sortOrder: 0 }],
        status: 'published',
      },
    });
    expect(itemRes.statusCode).toBe(200);
    const itemId = itemRes.json<{ id: string }>().id;

    const publishRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/publish',
      headers: internalAuth,
    });
    expect(publishRes.statusCode).toBe(200);

    const menuRes = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { 'x-tenant-slug': 'cafe-a' },
    });
    expect(menuRes.statusCode).toBe(200);
    const menu = menuRes.json<{
      items: { id: string; slug: string; imageUrl: string | null }[];
    }>();
    const item = menu.items.find((i) => i.id === itemId);
    expect(item?.slug).toBe('margherita');
    // RES-92: raw S3 key never crosses the wire; the response carries
    // a presigned URL instead.
    expect(item?.imageUrl).toBe('https://signed.test/menu/margherita.webp?expires=300');
    expect(JSON.stringify(menu)).not.toContain('imageS3Key');
  }, 60_000);

  it('rejects internal write without the shared token', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: { 'x-tenant-slug': 'cafe-a' },
      payload: { slug: 'drinks', name: { en: 'Drinks' } },
    });
    expect(res.statusCode).toBe(401);
  });

  it('operator with internal token can upsert a modifier (RES-109)', async () => {
    const internalAuth = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'cafe-a' };
    const res = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/modifiers',
      headers: internalAuth,
      payload: {
        name: { en: 'Spice level' },
        minSelectable: 0,
        maxSelectable: 1,
        isRequired: false,
      },
    });
    expect(res.statusCode).toBe(200);
    const id = res.json<{ id: string }>().id;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('rejects modifier upsert without the internal token', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/modifiers',
      headers: { 'x-tenant-slug': 'cafe-a' },
      payload: { name: { en: 'No auth' }, minSelectable: 0, maxSelectable: 1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an invalid modifier (maxSelectable < minSelectable) at the DTO boundary', async () => {
    const internalAuth = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'cafe-a' };
    const res = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/modifiers',
      headers: internalAuth,
      payload: { name: { en: 'Bad' }, minSelectable: 3, maxSelectable: 1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("tenant B sniffing tenant A's item id gets 404 (RLS-backed)", async () => {
    const internalAuthA = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'cafe-a' };
    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: internalAuthA,
      payload: { slug: 'drinks', name: { en: 'Drinks' } },
    });
    const categoryId = categoryRes.json<{ id: string }>().id;
    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/items',
      headers: internalAuthA,
      payload: {
        categoryId,
        slug: 'cola',
        name: { en: 'Cola' },
        basePrice: '3.00',
        currency: 'USD',
        status: 'published',
      },
    });
    const tenantAItemId = itemRes.json<{ id: string }>().id;

    // Publish so the item is reachable on the public read path.
    const publishRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/publish',
      headers: internalAuthA,
    });
    expect(publishRes.statusCode).toBe(200);

    // Positive control: tenant A reads its own item — proves the route is
    // mounted and the id is real (RES-109). Without this, the 404 below
    // could be a route-not-found bug rather than RLS doing its job.
    const ownerView = await stack.app.inject({
      method: 'GET',
      url: `/v1/menu/items/${tenantAItemId}`,
      headers: { 'x-tenant-slug': 'cafe-a' },
    });
    expect(ownerView.statusCode).toBe(200);
    expect(ownerView.json<{ id: string; slug: string }>().slug).toBe('cola');

    // Now request the same id from tenant B's host. RLS should return 404.
    const sniff = await stack.app.inject({
      method: 'GET',
      url: `/v1/menu/items/${tenantAItemId}`,
      headers: { 'x-tenant-slug': 'cafe-b' },
    });
    expect(sniff.statusCode).toBe(404);
  }, 60_000);

  it('returns 404 with code on GET /v1/menu/items with a malformed (non-UUID) id', async () => {
    await provisionTenant(stack.app, {
      slug: 'cafe-malformed',
      displayName: 'Cafe Malformed',
    });

    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu/items/not-a-uuid',
      headers: { 'x-tenant-slug': 'cafe-malformed' },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json<{ type: string; status: number }>();
    expect(body.status).toBe(404);
    expect(body.type).toBe('https://resto.app/problems/catalog.menu_item_not_found');
  }, 60_000);

  it("tenant A's published menu contains no rows from tenant B (RES-241 ScopedTx auto-filter)", async () => {
    const authA = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'cafe-a' };
    const authB = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'cafe-b' };

    // Seed tenant A: category + published item with unique cross-tenant slugs.
    const aCatRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: authA,
      payload: { slug: 'xt-a-cat', name: { en: 'XT A category' }, sortOrder: 0 },
    });
    expect(aCatRes.statusCode).toBe(200);
    const aCategoryId = aCatRes.json<{ id: string }>().id;
    const aItemRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/items',
      headers: authA,
      payload: {
        categoryId: aCategoryId,
        slug: 'xt-a-item',
        name: { en: 'XT A item' },
        basePrice: '10.00',
        currency: 'USD',
        status: 'published',
      },
    });
    expect(aItemRes.statusCode).toBe(200);

    // Seed tenant B: category + published item with B-specific slugs.
    const bCatRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: authB,
      payload: { slug: 'xt-b-cat', name: { en: 'XT B category' }, sortOrder: 0 },
    });
    expect(bCatRes.statusCode).toBe(200);
    const bCategoryId = bCatRes.json<{ id: string }>().id;
    const bItemRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/items',
      headers: authB,
      payload: {
        categoryId: bCategoryId,
        slug: 'xt-b-item',
        name: { en: 'XT B item' },
        basePrice: '20.00',
        currency: 'USD',
        status: 'published',
      },
    });
    expect(bItemRes.statusCode).toBe(200);

    // Publish both tenants' menus.
    expect(
      (
        await stack.app.inject({
          method: 'POST',
          url: '/internal/v1/catalog/publish',
          headers: authA,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await stack.app.inject({
          method: 'POST',
          url: '/internal/v1/catalog/publish',
          headers: authB,
        })
      ).statusCode,
    ).toBe(200);

    // Tenant A reads its published menu. ScopedTx's auto-applied
    // `eq(table.tenantId, ALS.tenantId)` (with RLS as the second line of
    // defense) must keep tenant B's category and item out of the response.
    const menuRes = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { 'x-tenant-slug': 'cafe-a' },
    });
    expect(menuRes.statusCode).toBe(200);
    const menu = menuRes.json<{
      categories: { slug: string }[];
      items: { slug: string }[];
    }>();

    expect(menu.categories.map((c) => c.slug)).toContain('xt-a-cat');
    expect(menu.items.map((i) => i.slug)).toContain('xt-a-item');
    expect(menu.categories.map((c) => c.slug)).not.toContain('xt-b-cat');
    expect(menu.items.map((i) => i.slug)).not.toContain('xt-b-item');
  }, 60_000);
});
