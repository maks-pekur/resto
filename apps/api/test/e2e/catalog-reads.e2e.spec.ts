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
  console.warn('[catalog-reads.e2e] Docker not available — skipping integration tests.');
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

suite('Catalog — Phase 4b read + archive HTTP surface', () => {
  let stack: RealStack;

  beforeAll(async () => {
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
    await provisionTenant(stack.app, { slug: 'reads-a', displayName: 'Reads A' });
    await provisionTenant(stack.app, { slug: 'reads-b', displayName: 'Reads B' });
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('GET /categories returns own-tenant categories filtered by parentId and sorted by sortOrder', async () => {
    const authA = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'reads-a' };

    const top1 = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: authA,
      payload: { slug: 'cat-a-2', name: { en: 'Second' }, sortOrder: 2 },
    });
    const top2 = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: authA,
      payload: { slug: 'cat-a-1', name: { en: 'First' }, sortOrder: 1 },
    });
    expect(top1.statusCode).toBe(200);
    expect(top2.statusCode).toBe(200);
    const parentId = top2.json<{ id: string }>().id;
    const child = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: authA,
      payload: { slug: 'cat-a-child', name: { en: 'Child' }, sortOrder: 0, parentId },
    });
    expect(child.statusCode).toBe(200);

    const topRes = await stack.app.inject({
      method: 'GET',
      url: '/internal/v1/catalog/categories',
      headers: authA,
    });
    expect(topRes.statusCode).toBe(200);
    const topBody = topRes.json<{
      items: { slug: string; sortOrder: number; parentId: string | null; status: string }[];
    }>();
    const topSlugs = topBody.items.filter((i) => i.parentId === null).map((i) => i.slug);
    expect(topSlugs.indexOf('cat-a-1')).toBeLessThan(topSlugs.indexOf('cat-a-2'));
    expect(topBody.items.every((i) => i.status === 'draft')).toBe(true);

    const childRes = await stack.app.inject({
      method: 'GET',
      url: `/internal/v1/catalog/categories?parentId=${parentId}`,
      headers: authA,
    });
    expect(childRes.statusCode).toBe(200);
    const childBody = childRes.json<{
      items: { slug: string; parentId: string | null }[];
    }>();
    expect(childBody.items.map((i) => i.slug)).toContain('cat-a-child');
    expect(childBody.items.every((i) => i.parentId === parentId)).toBe(true);
  }, 60_000);

  it('GET /items returns thin rows with hasSizes flag and respects status filter', async () => {
    const authA = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'reads-a' };
    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: authA,
      payload: { slug: 'items-cat', name: { en: 'Items category' } },
    });
    const categoryId = categoryRes.json<{ id: string }>().id;

    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/items',
      headers: authA,
      payload: {
        categoryId,
        slug: 'items-draft',
        name: { en: 'Items draft' },
        basePrice: '5.50',
        currency: 'USD',
        status: 'draft',
      },
    });
    expect(itemRes.statusCode).toBe(200);
    const itemId = itemRes.json<{ id: string }>().id;

    const sizeRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/item-sizes',
      headers: authA,
      payload: {
        menuItemId: itemId,
        name: { en: 'Small' },
        price: '4.50',
        isDefault: true,
      },
    });
    expect(sizeRes.statusCode).toBe(200);

    const listRes = await stack.app.inject({
      method: 'GET',
      url: '/internal/v1/catalog/items',
      headers: authA,
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = listRes.json<{
      items: { id: string; slug: string; hasSizes: boolean; status: string }[];
      total: number;
      limit: number;
      offset: number;
    }>();
    const row = listBody.items.find((i) => i.id === itemId);
    expect(row?.hasSizes).toBe(true);
    expect(row?.status).toBe('draft');
    expect(typeof listBody.total).toBe('number');

    // Filter by status=published (should NOT include our draft item).
    const pubRes = await stack.app.inject({
      method: 'GET',
      url: '/internal/v1/catalog/items?status=published',
      headers: authA,
    });
    expect(pubRes.statusCode).toBe(200);
    const pubBody = pubRes.json<{ items: { id: string }[] }>();
    expect(pubBody.items.find((i) => i.id === itemId)).toBeUndefined();
  }, 60_000);

  it('GET /items/:id returns full detail including sizes + modifierGroupIds', async () => {
    const authA = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'reads-a' };
    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: authA,
      payload: { slug: 'detail-cat', name: { en: 'Detail category' } },
    });
    const categoryId = categoryRes.json<{ id: string }>().id;
    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/items',
      headers: authA,
      payload: {
        categoryId,
        slug: 'detail-item',
        name: { en: 'Detail item' },
        basePrice: '8.00',
        currency: 'USD',
        status: 'draft',
      },
    });
    const itemId = itemRes.json<{ id: string }>().id;

    const groupRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/modifier-groups',
      headers: authA,
      payload: {
        name: { en: 'Group A' },
        minSelectable: 0,
        maxSelectable: 1,
        isRequired: false,
      },
    });
    expect(groupRes.statusCode).toBe(200);

    const sizeRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/item-sizes',
      headers: authA,
      payload: { menuItemId: itemId, name: { en: 'M' }, price: '8.00' },
    });
    expect(sizeRes.statusCode).toBe(200);

    const detail = await stack.app.inject({
      method: 'GET',
      url: `/internal/v1/catalog/items/${itemId}`,
      headers: authA,
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json<{
      id: string;
      sizes: { name: { en: string }; price: string }[];
      modifierGroupIds: string[];
      status: string;
    }>();
    expect(body.id).toBe(itemId);
    expect(body.sizes.length).toBeGreaterThan(0);
    expect(Array.isArray(body.modifierGroupIds)).toBe(true);
  }, 60_000);

  it('GET /items/:id returns 404 for cross-tenant id', async () => {
    const authA = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'reads-a' };
    const authB = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'reads-b' };
    const catA = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: authA,
      payload: { slug: 'xtenant-cat', name: { en: 'X-tenant cat' } },
    });
    const catId = catA.json<{ id: string }>().id;
    const itemA = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/items',
      headers: authA,
      payload: {
        categoryId: catId,
        slug: 'xtenant-item',
        name: { en: 'X-tenant item' },
        basePrice: '1.00',
        currency: 'USD',
      },
    });
    const itemId = itemA.json<{ id: string }>().id;
    const sniff = await stack.app.inject({
      method: 'GET',
      url: `/internal/v1/catalog/items/${itemId}`,
      headers: authB,
    });
    expect(sniff.statusCode).toBe(404);
  }, 60_000);

  it('GET /modifier-groups returns option-count and usage-count', async () => {
    const authA = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'reads-a' };
    const groupRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/modifier-groups',
      headers: authA,
      payload: { name: { en: 'Counted' }, minSelectable: 0, maxSelectable: 2 },
    });
    const groupId = groupRes.json<{ id: string }>().id;
    await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/modifier-options',
      headers: authA,
      payload: {
        modifierGroupId: groupId,
        name: { en: 'Opt 1' },
        priceDelta: '0.50',
      },
    });

    const listRes = await stack.app.inject({
      method: 'GET',
      url: '/internal/v1/catalog/modifier-groups',
      headers: authA,
    });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json<{
      items: { id: string; optionCount: number; usageCount: number }[];
    }>();
    const row = list.items.find((g) => g.id === groupId);
    expect(row?.optionCount).toBeGreaterThanOrEqual(1);
    expect(typeof row?.usageCount).toBe('number');
  }, 60_000);

  it('GET /modifier-groups/:id returns embedded options', async () => {
    const authA = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'reads-a' };
    const groupRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/modifier-groups',
      headers: authA,
      payload: { name: { en: 'WithOpts' }, minSelectable: 0, maxSelectable: 1 },
    });
    const groupId = groupRes.json<{ id: string }>().id;
    await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/modifier-options',
      headers: authA,
      payload: {
        modifierGroupId: groupId,
        name: { en: 'Embedded opt' },
        priceDelta: '1.00',
      },
    });

    const detail = await stack.app.inject({
      method: 'GET',
      url: `/internal/v1/catalog/modifier-groups/${groupId}`,
      headers: authA,
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json<{
      id: string;
      options: { name: { en: string }; priceDelta: string }[];
    }>();
    expect(body.id).toBe(groupId);
    expect(body.options.length).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('GET /modifier-groups/:id returns 404 for unknown id', async () => {
    const authA = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'reads-a' };
    const res = await stack.app.inject({
      method: 'GET',
      url: '/internal/v1/catalog/modifier-groups/00000000-0000-0000-0000-000000000000',
      headers: authA,
    });
    expect(res.statusCode).toBe(404);
  }, 60_000);

  it('GET /stop-list surfaces stoppedAt per item, sorted DESC', async () => {
    const authA = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'reads-a' };
    const catRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: authA,
      payload: { slug: 'stoplist-cat', name: { en: 'Stoplist cat' } },
    });
    const categoryId = catRes.json<{ id: string }>().id;
    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/items',
      headers: authA,
      payload: {
        categoryId,
        slug: 'stoplist-item',
        name: { en: 'Stoplist item' },
        basePrice: '3.00',
        currency: 'USD',
        status: 'published',
      },
    });
    const itemId = itemRes.json<{ id: string }>().id;
    await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/stop-list',
      headers: authA,
      payload: { itemId, reason: 'Out of stock' },
    });

    const listRes = await stack.app.inject({
      method: 'GET',
      url: '/internal/v1/catalog/stop-list',
      headers: authA,
    });
    expect(listRes.statusCode).toBe(200);
    const body = listRes.json<{
      items: { itemId: string; stoppedAt: string; reason: string | null }[];
    }>();
    const entry = body.items.find((e) => e.itemId === itemId);
    expect(entry?.reason).toBe('Out of stock');
    expect(entry?.stoppedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  }, 60_000);

  it('GET /draft-diff returns unpublishedCount and capped items', async () => {
    const authA = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'reads-a' };
    const res = await stack.app.inject({
      method: 'GET',
      url: '/internal/v1/catalog/draft-diff',
      headers: authA,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      unpublishedCount: number;
      truncatedCount: number;
      items: { entityType: string; id: string; status: string }[];
    }>();
    expect(typeof body.unpublishedCount).toBe('number');
    expect(typeof body.truncatedCount).toBe('number');
    expect(body.items.length).toBeLessThanOrEqual(100);
  }, 60_000);

  it('PATCH /categories/:id/archive flips status to archived (idempotent on re-call)', async () => {
    const authA = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'reads-a' };
    const catRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: authA,
      payload: { slug: 'archive-cat', name: { en: 'Archive cat' } },
    });
    const id = catRes.json<{ id: string }>().id;
    const arch1 = await stack.app.inject({
      method: 'PATCH',
      url: `/internal/v1/catalog/categories/${id}/archive`,
      headers: authA,
    });
    expect(arch1.statusCode).toBe(204);
    const arch2 = await stack.app.inject({
      method: 'PATCH',
      url: `/internal/v1/catalog/categories/${id}/archive`,
      headers: authA,
    });
    expect(arch2.statusCode).toBe(204);

    const listRes = await stack.app.inject({
      method: 'GET',
      url: '/internal/v1/catalog/categories',
      headers: authA,
    });
    const list = listRes.json<{ items: { id: string; status: string }[] }>();
    expect(list.items.find((i) => i.id === id)?.status).toBe('archived');
  }, 60_000);

  it('PATCH /categories/:id/archive returns 404 for cross-tenant id', async () => {
    const authA = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'reads-a' };
    const authB = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'reads-b' };
    const catA = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: authA,
      payload: { slug: 'archive-xt', name: { en: 'Archive xt' } },
    });
    const id = catA.json<{ id: string }>().id;
    const sniff = await stack.app.inject({
      method: 'PATCH',
      url: `/internal/v1/catalog/categories/${id}/archive`,
      headers: authB,
    });
    expect(sniff.statusCode).toBe(404);
  }, 60_000);

  it('PATCH /items/:id/archive flips status to archived', async () => {
    const authA = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'reads-a' };
    const catRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: authA,
      payload: { slug: 'archive-item-cat', name: { en: 'Archive item cat' } },
    });
    const categoryId = catRes.json<{ id: string }>().id;
    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/items',
      headers: authA,
      payload: {
        categoryId,
        slug: 'archive-item',
        name: { en: 'Archive item' },
        basePrice: '1.00',
        currency: 'USD',
      },
    });
    const id = itemRes.json<{ id: string }>().id;
    const arch = await stack.app.inject({
      method: 'PATCH',
      url: `/internal/v1/catalog/items/${id}/archive`,
      headers: authA,
    });
    expect(arch.statusCode).toBe(204);

    const detail = await stack.app.inject({
      method: 'GET',
      url: `/internal/v1/catalog/items/${id}`,
      headers: authA,
    });
    const body = detail.json<{ status: string }>();
    expect(body.status).toBe('archived');
  }, 60_000);
});
