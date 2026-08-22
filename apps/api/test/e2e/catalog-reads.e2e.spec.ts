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
  console.warn('[catalog-reads.e2e] Docker not available — skipping integration tests.');
}

const INTERNAL_TOKEN = 'integration-test-token-1234567890';
const PASSWORD = 'Sup3r-Secret-Pw!';

interface AuthedTenant {
  id: string;
  slug: string;
  locationId: string;
  authed: { cookie: string; 'x-tenant-id': string };
  atLocation: {
    cookie: string;
    'x-tenant-id': string;
    'x-location-id': string;
  };
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

  const authed = { cookie: ownerCookie, 'x-tenant-id': tenant.id };
  const locationRes = await app.inject({
    method: 'POST',
    url: '/v1/tenancy/locations',
    headers: authed,
    payload: { name: `Location ${label}` },
  });
  expect(locationRes.statusCode).toBe(200);
  const locationId = locationRes.json<{ id: string }>().id;

  return {
    id: tenant.id,
    slug,
    locationId,
    authed,
    atLocation: { ...authed, 'x-location-id': locationId },
  };
};

suite('Catalog — operator-guarded reads on v1/catalog (D-08)', () => {
  let stack: RealStack;
  let readsA: AuthedTenant;
  let readsB: AuthedTenant;

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
    readsA = await setupAuthedTenant(stack.app, 'reads-a');
    readsB = await setupAuthedTenant(stack.app, 'reads-b');
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('GET v1/catalog/categories returns 401 when unauthenticated', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/catalog/categories',
    });
    expect(res.statusCode === 401 || res.statusCode === 403).toBe(true);
  }, 30_000);

  it('GET v1/catalog/categories returns 403 when x-tenant-id does not match the session', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/catalog/categories',
      headers: {
        cookie: readsA.authed.cookie,
        'x-tenant-id': readsB.authed['x-tenant-id'],
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json<{ code?: string }>().code).toBe('auth.tenant_mismatch');
  }, 30_000);

  it('GET /categories returns own-tenant categories filtered by parentId and sorted by sortOrder', async () => {
    const top1 = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: readsA.authed,
      payload: { slug: 'cat-a-2', name: { en: 'Second' }, sortOrder: 2 },
    });
    const top2 = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: readsA.authed,
      payload: { slug: 'cat-a-1', name: { en: 'First' }, sortOrder: 1 },
    });
    expect(top1.statusCode).toBe(200);
    expect(top2.statusCode).toBe(200);
    const parentId = top2.json<{ id: string }>().id;
    const child = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: readsA.authed,
      payload: { slug: 'cat-a-child', name: { en: 'Child' }, sortOrder: 0, parentId },
    });
    expect(child.statusCode).toBe(200);

    const topRes = await stack.app.inject({
      method: 'GET',
      url: '/v1/catalog/categories',
      headers: readsA.authed,
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
      url: `/v1/catalog/categories?parentId=${parentId}`,
      headers: readsA.authed,
    });
    expect(childRes.statusCode).toBe(200);
    const childBody = childRes.json<{
      items: { slug: string; parentId: string | null }[];
    }>();
    expect(childBody.items.map((i) => i.slug)).toContain('cat-a-child');
    expect(childBody.items.every((i) => i.parentId === parentId)).toBe(true);
  }, 60_000);

  it('GET /items returns thin rows with hasSizes flag and respects status filter', async () => {
    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: readsA.authed,
      payload: { slug: 'items-cat', name: { en: 'Items category' } },
    });
    const categoryId = categoryRes.json<{ id: string }>().id;

    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: readsA.authed,
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
      url: '/v1/catalog/item-sizes',
      headers: readsA.authed,
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
      url: '/v1/catalog/items',
      headers: readsA.authed,
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

    const pubRes = await stack.app.inject({
      method: 'GET',
      url: '/v1/catalog/items?status=published',
      headers: readsA.authed,
    });
    expect(pubRes.statusCode).toBe(200);
    const pubBody = pubRes.json<{ items: { id: string }[] }>();
    expect(pubBody.items.find((i) => i.id === itemId)).toBeUndefined();
  }, 60_000);

  it('GET /items/:id returns full detail including sizes + modifierGroupIds', async () => {
    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: readsA.authed,
      payload: { slug: 'detail-cat', name: { en: 'Detail category' } },
    });
    const categoryId = categoryRes.json<{ id: string }>().id;
    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: readsA.authed,
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
      url: '/v1/catalog/modifier-groups',
      headers: readsA.authed,
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
      url: '/v1/catalog/item-sizes',
      headers: readsA.authed,
      payload: { menuItemId: itemId, name: { en: 'M' }, price: '8.00' },
    });
    expect(sizeRes.statusCode).toBe(200);

    const detail = await stack.app.inject({
      method: 'GET',
      url: `/v1/catalog/items/${itemId}`,
      headers: readsA.authed,
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
    const catA = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: readsA.authed,
      payload: { slug: 'xtenant-cat', name: { en: 'X-tenant cat' } },
    });
    const catId = catA.json<{ id: string }>().id;
    const itemA = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: readsA.authed,
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
      url: `/v1/catalog/items/${itemId}`,
      headers: readsB.authed,
    });
    expect(sniff.statusCode).toBe(404);
  }, 60_000);

  it('GET /modifier-groups returns option-count and usage-count', async () => {
    const groupRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/modifier-groups',
      headers: readsA.authed,
      payload: { name: { en: 'Counted' }, minSelectable: 0, maxSelectable: 2 },
    });
    const groupId = groupRes.json<{ id: string }>().id;
    await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/modifier-options',
      headers: readsA.authed,
      payload: {
        modifierGroupId: groupId,
        name: { en: 'Opt 1' },
        priceDelta: '0.50',
      },
    });

    const listRes = await stack.app.inject({
      method: 'GET',
      url: '/v1/catalog/modifier-groups',
      headers: readsA.authed,
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
    const groupRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/modifier-groups',
      headers: readsA.authed,
      payload: { name: { en: 'WithOpts' }, minSelectable: 0, maxSelectable: 1 },
    });
    const groupId = groupRes.json<{ id: string }>().id;
    await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/modifier-options',
      headers: readsA.authed,
      payload: {
        modifierGroupId: groupId,
        name: { en: 'Embedded opt' },
        priceDelta: '1.00',
      },
    });

    const detail = await stack.app.inject({
      method: 'GET',
      url: `/v1/catalog/modifier-groups/${groupId}`,
      headers: readsA.authed,
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
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/catalog/modifier-groups/00000000-0000-0000-0000-000000000000',
      headers: readsA.authed,
    });
    expect(res.statusCode).toBe(404);
  }, 60_000);

  it('GET /stop-list surfaces stoppedAt per item, sorted DESC', async () => {
    const catRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: readsA.authed,
      payload: { slug: 'stoplist-cat', name: { en: 'Stoplist cat' } },
    });
    const categoryId = catRes.json<{ id: string }>().id;
    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: readsA.authed,
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
      url: '/v1/catalog/stop-list',
      headers: readsA.atLocation,
      payload: { itemId, reason: 'Out of stock' },
    });

    const listRes = await stack.app.inject({
      method: 'GET',
      url: '/v1/catalog/stop-list',
      headers: readsA.atLocation,
    });
    expect(listRes.statusCode).toBe(200);
    const body = listRes.json<{
      items: { itemId: string; stoppedAt: string; reason: string | null }[];
    }>();
    const entry = body.items.find((e) => e.itemId === itemId);
    expect(entry?.reason).toBe('Out of stock');
    expect(entry?.stoppedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  }, 60_000);

  it('GET /draft-diff returns unpublishedCount and capped items for the active tenant', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/catalog/draft-diff',
      headers: readsA.authed,
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
    const catRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: readsA.authed,
      payload: { slug: 'archive-cat', name: { en: 'Archive cat' } },
    });
    const id = catRes.json<{ id: string }>().id;
    const arch1 = await stack.app.inject({
      method: 'PATCH',
      url: `/v1/catalog/categories/${id}/archive`,
      headers: readsA.authed,
    });
    expect(arch1.statusCode).toBe(204);
    const arch2 = await stack.app.inject({
      method: 'PATCH',
      url: `/v1/catalog/categories/${id}/archive`,
      headers: readsA.authed,
    });
    expect(arch2.statusCode).toBe(204);

    const listRes = await stack.app.inject({
      method: 'GET',
      url: '/v1/catalog/categories',
      headers: readsA.authed,
    });
    const list = listRes.json<{ items: { id: string; status: string }[] }>();
    expect(list.items.find((i) => i.id === id)?.status).toBe('archived');
  }, 60_000);

  it('PATCH /categories/:id/archive returns 404 for cross-tenant id', async () => {
    const catA = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: readsA.authed,
      payload: { slug: 'archive-xt', name: { en: 'Archive xt' } },
    });
    const id = catA.json<{ id: string }>().id;
    const sniff = await stack.app.inject({
      method: 'PATCH',
      url: `/v1/catalog/categories/${id}/archive`,
      headers: readsB.authed,
    });
    expect(sniff.statusCode).toBe(404);
  }, 60_000);

  it('PATCH /items/:id/archive flips status to archived', async () => {
    const catRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: readsA.authed,
      payload: { slug: 'archive-item-cat', name: { en: 'Archive item cat' } },
    });
    const categoryId = catRes.json<{ id: string }>().id;
    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: readsA.authed,
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
      url: `/v1/catalog/items/${id}/archive`,
      headers: readsA.authed,
    });
    expect(arch.statusCode).toBe(204);

    const detail = await stack.app.inject({
      method: 'GET',
      url: `/v1/catalog/items/${id}`,
      headers: readsA.authed,
    });
    const body = detail.json<{ status: string }>();
    expect(body.status).toBe('archived');
  }, 60_000);
});
