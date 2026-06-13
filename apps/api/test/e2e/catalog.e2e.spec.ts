import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { TenantAwareDb } from '@resto/db';
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
  console.warn('[catalog.e2e] Docker not available — skipping integration tests.');
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

suite('Catalog — authed write → public read → cross-tenant isolation', () => {
  let stack: RealStack;
  let cafeA: AuthedTenant;
  let cafeB: AuthedTenant;

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

    cafeA = await setupAuthedTenant(stack.app, 'cafe-a');
    cafeB = await setupAuthedTenant(stack.app, 'cafe-b');
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('an authenticated owner can upsert + publish, and the public menu surfaces the item', async () => {
    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: cafeA.authed,
      payload: { slug: 'pizza', name: { en: 'Pizza' }, sortOrder: 0 },
    });
    expect(categoryRes.statusCode).toBe(200);
    const categoryId = categoryRes.json<{ id: string }>().id;

    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: cafeA.authed,
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
      url: '/v1/catalog/publish',
      headers: cafeA.authed,
    });
    expect(publishRes.statusCode).toBe(200);

    const menuRes = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { 'x-tenant-slug': cafeA.slug },
    });
    expect(menuRes.statusCode).toBe(200);
    const menu = menuRes.json<{
      items: {
        id: string;
        slug: string;
        imageUrl: string | null;
        photos: { s3Key: string; url: string; sortOrder: number; isPrimary?: boolean }[];
      }[];
    }>();
    const item = menu.items.find((i) => i.id === itemId);
    expect(item?.slug).toBe('margherita');
    expect(item?.imageUrl).toBe('https://signed.test/menu/margherita.webp?expires=300');
    expect(item?.photos).toHaveLength(1);
    expect(item?.photos[0]?.url).toBe('https://signed.test/menu/margherita.webp?expires=300');
    expect(item?.photos[0]?.s3Key).toBe('menu/margherita.webp');
    expect(JSON.stringify(menu)).not.toContain('imageS3Key');
  }, 60_000);

  it('rejects an unauthenticated catalog write with 401', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: { 'x-tenant-id': cafeA.id },
      payload: { slug: 'drinks', name: { en: 'Drinks' } },
    });
    expect(res.statusCode).toBe(401);
  });

  it('an authenticated owner can upsert a modifier group (RES-109)', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/modifier-groups',
      headers: cafeA.authed,
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

  it('rejects an unauthenticated modifier-group upsert with 401', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/modifier-groups',
      headers: { 'x-tenant-id': cafeA.id },
      payload: { name: { en: 'No auth' }, minSelectable: 0, maxSelectable: 1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an invalid modifier group (maxSelectable < minSelectable) at the DTO boundary', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/modifier-groups',
      headers: cafeA.authed,
      payload: { name: { en: 'Bad' }, minSelectable: 3, maxSelectable: 1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("tenant B sniffing tenant A's item id gets 404 (RLS-backed)", async () => {
    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: cafeA.authed,
      payload: { slug: 'drinks', name: { en: 'Drinks' } },
    });
    const categoryId = categoryRes.json<{ id: string }>().id;
    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: cafeA.authed,
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

    const publishRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/publish',
      headers: cafeA.authed,
    });
    expect(publishRes.statusCode).toBe(200);

    const ownerView = await stack.app.inject({
      method: 'GET',
      url: `/v1/menu/items/${tenantAItemId}`,
      headers: { 'x-tenant-slug': cafeA.slug },
    });
    expect(ownerView.statusCode).toBe(200);
    expect(ownerView.json<{ id: string; slug: string }>().slug).toBe('cola');

    const sniff = await stack.app.inject({
      method: 'GET',
      url: `/v1/menu/items/${tenantAItemId}`,
      headers: { 'x-tenant-slug': cafeB.slug },
    });
    expect(sniff.statusCode).toBe(404);
  }, 60_000);

  it('returns 404 with code on GET /v1/menu/items with a malformed (non-UUID) id', async () => {
    const cafeMalformed = await provisionTenant(
      stack.app,
      `cafe-malformed-${randomUUID().slice(0, 8)}`,
      INTERNAL_TOKEN,
    );

    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu/items/not-a-uuid',
      headers: { 'x-tenant-slug': cafeMalformed.slug },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json<{ type: string; status: number }>();
    expect(body.status).toBe(404);
    expect(body.type).toBe('https://resto.app/problems/catalog.menu_item_not_found');
  }, 60_000);

  it("tenant A's published menu contains no rows from tenant B (RES-241 ScopedTx auto-filter)", async () => {
    const aCatRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: cafeA.authed,
      payload: { slug: 'xt-a-cat', name: { en: 'XT A category' }, sortOrder: 0 },
    });
    expect(aCatRes.statusCode).toBe(200);
    const aCategoryId = aCatRes.json<{ id: string }>().id;
    const aItemRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: cafeA.authed,
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

    const bCatRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: cafeB.authed,
      payload: { slug: 'xt-b-cat', name: { en: 'XT B category' }, sortOrder: 0 },
    });
    expect(bCatRes.statusCode).toBe(200);
    const bCategoryId = bCatRes.json<{ id: string }>().id;
    const bItemRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: cafeB.authed,
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

    expect(
      (
        await stack.app.inject({
          method: 'POST',
          url: '/v1/catalog/publish',
          headers: cafeA.authed,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await stack.app.inject({
          method: 'POST',
          url: '/v1/catalog/publish',
          headers: cafeB.authed,
        })
      ).statusCode,
    ).toBe(200);

    const menuRes = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { 'x-tenant-slug': cafeA.slug },
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

  it('round-trips BJU + photos[] + source on POST items', async () => {
    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: cafeA.authed,
      payload: { slug: 'salads', name: { en: 'Salads' }, sortOrder: 0 },
    });
    expect(categoryRes.statusCode).toBe(200);
    const categoryId = categoryRes.json<{ id: string }>().id;

    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: cafeA.authed,
      payload: {
        categoryId,
        slug: 'cobb',
        name: { en: 'Cobb Salad' },
        basePrice: '14.00',
        currency: 'USD',
        photos: [
          { s3Key: 'menu/cobb-1.webp', sortOrder: 0, isPrimary: true },
          { s3Key: 'menu/cobb-2.webp', sortOrder: 1 },
        ],
        proteins: 32.5,
        fats: 18.2,
        carbs: 9.7,
        kcal: 410,
        nutritionEstimated: true,
        source: 'ai_generated',
        needsReview: true,
        status: 'published',
      },
    });
    expect(itemRes.statusCode).toBe(200);

    const menuRes = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { 'x-tenant-slug': cafeA.slug },
    });
    expect(menuRes.statusCode).toBe(200);
    const menu = menuRes.json<{
      items: {
        slug: string;
        photos: { s3Key: string; url: string; sortOrder: number; isPrimary?: boolean }[];
        proteins: string | null;
        fats: string | null;
        carbs: string | null;
        kcal: number | null;
        nutritionEstimated: boolean;
      }[];
    }>();
    const item = menu.items.find((i) => i.slug === 'cobb');
    expect(item).toBeDefined();
    expect(item?.photos).toHaveLength(2);
    expect(item?.photos[0]?.s3Key).toBe('menu/cobb-1.webp');
    expect(item?.photos[1]?.s3Key).toBe('menu/cobb-2.webp');
    expect(item?.proteins).toBe('32.50');
    expect(item?.fats).toBe('18.20');
    expect(item?.carbs).toBe('9.70');
    expect(item?.kcal).toBe(410);
    expect(item?.nutritionEstimated).toBe(true);
  }, 60_000);

  it('creates a modifier group then attaches an option; option fields round-trip on /v1/menu', async () => {
    const groupRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/modifier-groups',
      headers: cafeA.authed,
      payload: {
        name: { en: 'Crust' },
        minSelectable: 1,
        maxSelectable: 1,
        isRequired: true,
      },
    });
    expect(groupRes.statusCode).toBe(200);
    const groupId = groupRes.json<{ id: string }>().id;

    const optionRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/modifier-options',
      headers: cafeA.authed,
      payload: {
        modifierGroupId: groupId,
        name: { en: 'Thin' },
        priceDelta: '0.00',
        defaultAmount: 1,
        freeAmount: 1,
        sortOrder: 0,
      },
    });
    expect(optionRes.statusCode).toBe(200);

    const menuRes = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { 'x-tenant-slug': cafeA.slug },
    });
    expect(menuRes.statusCode).toBe(200);
    const menu = menuRes.json<{
      modifierGroups: {
        id: string;
        name: { en?: string };
        minSelectable: number;
        maxSelectable: number;
        isRequired: boolean;
        options: {
          name: { en?: string };
          priceDelta: string;
          defaultAmount: number;
          freeAmount: number;
        }[];
      }[];
    }>();
    const grp = menu.modifierGroups.find((g) => g.id === groupId);
    expect(grp).toBeDefined();
    expect(grp?.isRequired).toBe(true);
    expect(grp?.options).toHaveLength(1);
    expect(grp?.options[0]?.priceDelta).toBe('0.00');
    expect(grp?.options[0]?.defaultAmount).toBe(1);
    expect(grp?.options[0]?.freeAmount).toBe(1);
  }, 60_000);

  it('creates an item-size with an absolute price; round-trips on /v1/menu', async () => {
    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: cafeA.authed,
      payload: { slug: 'sizes-cat', name: { en: 'Sized' }, sortOrder: 0 },
    });
    expect(categoryRes.statusCode).toBe(200);
    const categoryId = categoryRes.json<{ id: string }>().id;

    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: cafeA.authed,
      payload: {
        categoryId,
        slug: 'pasta',
        name: { en: 'Pasta' },
        basePrice: '10.00',
        currency: 'USD',
        status: 'published',
      },
    });
    expect(itemRes.statusCode).toBe(200);
    const itemId = itemRes.json<{ id: string }>().id;

    const sizeRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/item-sizes',
      headers: cafeA.authed,
      payload: {
        menuItemId: itemId,
        name: { en: 'Large' },
        price: '14.50',
        isDefault: false,
        sortOrder: 1,
      },
    });
    expect(sizeRes.statusCode).toBe(200);

    const menuRes = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { 'x-tenant-slug': cafeA.slug },
    });
    expect(menuRes.statusCode).toBe(200);
    const menu = menuRes.json<{
      items: { slug: string; sizes: { name: { en?: string }; price: string }[] }[];
    }>();
    const item = menu.items.find((i) => i.slug === 'pasta');
    expect(item?.sizes).toHaveLength(1);
    expect(item?.sizes[0]?.price).toBe('14.50');
    expect(item?.sizes[0]?.name.en).toBe('Large');
  }, 60_000);

  it('stop-list overlay marks items isStopListed on /v1/menu; DELETE clears it', async () => {
    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: cafeA.authed,
      payload: { slug: 'stoplist-cat', name: { en: 'StopList' }, sortOrder: 0 },
    });
    expect(categoryRes.statusCode).toBe(200);
    const categoryId = categoryRes.json<{ id: string }>().id;

    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: cafeA.authed,
      payload: {
        categoryId,
        slug: 'stop-this',
        name: { en: 'StopThis' },
        basePrice: '5.00',
        currency: 'USD',
        status: 'published',
      },
    });
    expect(itemRes.statusCode).toBe(200);
    const itemId = itemRes.json<{ id: string }>().id;

    const beforeRes = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { 'x-tenant-slug': cafeA.slug },
    });
    const beforeBody = beforeRes.json<{ items: { id: string; isStopListed: boolean }[] }>();
    expect(beforeBody.items.find((i) => i.id === itemId)?.isStopListed).toBe(false);

    const stopRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/stop-list',
      headers: cafeA.authed,
      payload: { itemId, reason: '86 in the kitchen' },
    });
    expect(stopRes.statusCode).toBe(200);

    const stoppedRes = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { 'x-tenant-slug': cafeA.slug },
    });
    const stoppedBody = stoppedRes.json<{ items: { id: string; isStopListed: boolean }[] }>();
    const stoppedItem = stoppedBody.items.find((i) => i.id === itemId);
    expect(stoppedItem).toBeDefined();
    expect(stoppedItem?.isStopListed).toBe(true);

    const unstopRes = await stack.app.inject({
      method: 'DELETE',
      url: `/v1/catalog/stop-list/${itemId}`,
      headers: cafeA.authed,
    });
    expect(unstopRes.statusCode).toBe(204);

    const restoredRes = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { 'x-tenant-slug': cafeA.slug },
    });
    const restoredBody = restoredRes.json<{ items: { id: string; isStopListed: boolean }[] }>();
    expect(restoredBody.items.find((i) => i.id === itemId)?.isStopListed).toBe(false);
  }, 60_000);

  it('POST /publish then DELETE /publish within 5s cancels the timer — no outbox emission', async () => {
    const cafeUndo = await setupAuthedTenant(stack.app, 'cafe-undo');
    const db = stack.app.get(TenantAwareDb);

    const scheduleRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/publish',
      headers: cafeUndo.authed,
    });
    expect(scheduleRes.statusCode).toBe(200);
    const scheduled = scheduleRes.json<{ scheduled: boolean; cancelAfterMs: number }>();
    expect(scheduled.scheduled).toBe(true);
    expect(scheduled.cancelAfterMs).toBe(5_000);

    const cancelRes = await stack.app.inject({
      method: 'DELETE',
      url: '/v1/catalog/publish',
      headers: cafeUndo.authed,
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json<{ cancelled: boolean }>().cancelled).toBe(true);

    await new Promise((r) => setTimeout(r, 5_500));

    const outboxRows = await db.withoutTenant('inspect outbox after cancel', async (tx) =>
      tx.execute<{ count: string }>(
        sql`SELECT COUNT(*)::text AS count FROM outbox_events
            WHERE type IN ('catalog.menu_first_published.v1','catalog.menu_republished.v1')
              AND tenant_id = ${cafeUndo.id}::uuid`,
      ),
    );
    expect(outboxRows[0]?.count).toBe('0');
  }, 30_000);

  it('first POST /publish emits MenuFirstPublishedV1; second emits MenuRepublishedV1', async () => {
    const cafePub = await setupAuthedTenant(stack.app, 'cafe-pub');
    const db = stack.app.get(TenantAwareDb);

    const first = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/publish',
      headers: cafePub.authed,
    });
    expect(first.statusCode).toBe(200);

    await new Promise((r) => setTimeout(r, 5_500));

    const firstRow = await db.withoutTenant('check first publish event', async (tx) =>
      tx.execute<{ type: string }>(
        sql`SELECT type FROM outbox_events
            WHERE type IN ('catalog.menu_first_published.v1','catalog.menu_republished.v1')
              AND tenant_id = ${cafePub.id}::uuid
            ORDER BY occurred_at ASC`,
      ),
    );
    expect(firstRow.map((r) => r.type)).toEqual(['catalog.menu_first_published.v1']);

    const second = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/publish',
      headers: cafePub.authed,
    });
    expect(second.statusCode).toBe(200);

    await new Promise((r) => setTimeout(r, 5_500));

    const afterSecond = await db.withoutTenant('check second publish event', async (tx) =>
      tx.execute<{ type: string }>(
        sql`SELECT type FROM outbox_events
            WHERE type IN ('catalog.menu_first_published.v1','catalog.menu_republished.v1')
              AND tenant_id = ${cafePub.id}::uuid
            ORDER BY occurred_at ASC`,
      ),
    );
    expect(afterSecond.map((r) => r.type)).toEqual([
      'catalog.menu_first_published.v1',
      'catalog.menu_republished.v1',
    ]);
  }, 30_000);

  it('PUT item with a changed slug inserts a row in menu_item_slug_aliases', async () => {
    const db = stack.app.get(TenantAwareDb);

    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: cafeA.authed,
      payload: { slug: 'aliased-cat', name: { en: 'Aliased' }, sortOrder: 0 },
    });
    expect(categoryRes.statusCode).toBe(200);
    const categoryId = categoryRes.json<{ id: string }>().id;

    const createRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: cafeA.authed,
      payload: {
        categoryId,
        slug: 'old-name',
        name: { en: 'Old Name' },
        basePrice: '8.00',
        currency: 'USD',
        status: 'published',
      },
    });
    expect(createRes.statusCode).toBe(200);
    const itemId = createRes.json<{ id: string }>().id;

    const renameRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: cafeA.authed,
      payload: {
        id: itemId,
        categoryId,
        slug: 'new-name',
        name: { en: 'New Name' },
        basePrice: '8.00',
        currency: 'USD',
        status: 'published',
      },
    });
    expect(renameRes.statusCode).toBe(200);

    const aliases = await db.withoutTenant('inspect aliases', async (tx) =>
      tx.execute<{ alias: string }>(
        sql`SELECT alias FROM menu_item_slug_aliases WHERE item_id = ${itemId}`,
      ),
    );
    expect(aliases.map((a) => a.alias)).toContain('old-name');
  }, 60_000);

  it('cross-tenant: tenant B cannot read or stop tenant A items via the HTTP surface', async () => {
    const catRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: cafeA.authed,
      payload: { slug: 'iso-a-cat', name: { en: 'Iso A' }, sortOrder: 0 },
    });
    expect(catRes.statusCode).toBe(200);
    const itemARes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: cafeA.authed,
      payload: {
        categoryId: catRes.json<{ id: string }>().id,
        slug: 'iso-a-item',
        name: { en: 'IsoA' },
        basePrice: '3.00',
        currency: 'USD',
        status: 'published',
      },
    });
    expect(itemARes.statusCode).toBe(200);
    const itemAId = itemARes.json<{ id: string }>().id;

    const sniff = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/stop-list',
      headers: cafeB.authed,
      payload: { itemId: itemAId },
    });
    expect(sniff.statusCode).not.toBe(200);
  }, 60_000);
});
