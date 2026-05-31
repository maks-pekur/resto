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

    // Plan 04a-07: publish is now delayed (5s timer). `/v1/menu` still
    // returns items with status='published' immediately because the read
    // path uses repo.loadPublishedMenu regardless of version bump state;
    // outbox emission is checked in the dedicated delayed-publish test.

    const menuRes = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { 'x-tenant-slug': 'cafe-a' },
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
    // RES-92: raw S3 key never crosses the wire; the response carries
    // a presigned URL instead. `imageUrl` is `photos[0]?.url` for
    // backward-compat with v1 callers.
    expect(item?.imageUrl).toBe('https://signed.test/menu/margherita.webp?expires=300');
    expect(item?.photos).toHaveLength(1);
    expect(item?.photos[0]?.url).toBe('https://signed.test/menu/margherita.webp?expires=300');
    expect(item?.photos[0]?.s3Key).toBe('menu/margherita.webp');
    // raw S3 key never appears as an outbound DTO field.
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

  it('operator with internal token can upsert a modifier group (RES-109)', async () => {
    const internalAuth = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'cafe-a' };
    const res = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/modifier-groups',
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

  it('rejects modifier-group upsert without the internal token', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/modifier-groups',
      headers: { 'x-tenant-slug': 'cafe-a' },
      payload: { name: { en: 'No auth' }, minSelectable: 0, maxSelectable: 1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an invalid modifier group (maxSelectable < minSelectable) at the DTO boundary', async () => {
    const internalAuth = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'cafe-a' };
    const res = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/modifier-groups',
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

  /*
   * ── Plan 04a-07 — new HTTP surface coverage ──
   *
   * The tests below exercise the endpoints added in plan 04a-07:
   *   POST /modifier-options, POST /item-sizes, POST/DELETE /stop-list,
   *   POST /publish (delayed) + DELETE /publish (Undo), PUT-via-POST item
   *   with slug change → menu_item_slug_aliases row.
   *
   * They depend on the cafe-a tenant seeded in beforeAll. Each test creates
   * its own categories/items/slugs to avoid cross-test interference.
   */

  it('round-trips BJU + photos[] + source on POST items', async () => {
    const internalAuth = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'cafe-a' };

    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: internalAuth,
      payload: { slug: 'salads', name: { en: 'Salads' }, sortOrder: 0 },
    });
    expect(categoryRes.statusCode).toBe(200);
    const categoryId = categoryRes.json<{ id: string }>().id;

    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/items',
      headers: internalAuth,
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
      headers: { 'x-tenant-slug': 'cafe-a' },
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
    // Numeric BJU columns are emitted as decimal strings (Drizzle numeric).
    expect(item?.proteins).toBe('32.50');
    expect(item?.fats).toBe('18.20');
    expect(item?.carbs).toBe('9.70');
    expect(item?.kcal).toBe(410);
    expect(item?.nutritionEstimated).toBe(true);
  }, 60_000);

  it('creates a modifier group then attaches an option; option fields round-trip on /v1/menu', async () => {
    const internalAuth = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'cafe-a' };

    const groupRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/modifier-groups',
      headers: internalAuth,
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
      url: '/internal/v1/catalog/modifier-options',
      headers: internalAuth,
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
      headers: { 'x-tenant-slug': 'cafe-a' },
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
    const internalAuth = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'cafe-a' };

    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: internalAuth,
      payload: { slug: 'sizes-cat', name: { en: 'Sized' }, sortOrder: 0 },
    });
    expect(categoryRes.statusCode).toBe(200);
    const categoryId = categoryRes.json<{ id: string }>().id;

    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/items',
      headers: internalAuth,
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
      url: '/internal/v1/catalog/item-sizes',
      headers: internalAuth,
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
      headers: { 'x-tenant-slug': 'cafe-a' },
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

  it('stop-list overlay filters items on /v1/menu; DELETE restores them', async () => {
    const internalAuth = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'cafe-a' };

    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: internalAuth,
      payload: { slug: 'stoplist-cat', name: { en: 'StopList' }, sortOrder: 0 },
    });
    expect(categoryRes.statusCode).toBe(200);
    const categoryId = categoryRes.json<{ id: string }>().id;

    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/items',
      headers: internalAuth,
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

    // Sanity: item visible before stop-list.
    const beforeRes = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { 'x-tenant-slug': 'cafe-a' },
    });
    const beforeBody = beforeRes.json<{ items: { id: string }[] }>();
    expect(beforeBody.items.map((i) => i.id)).toContain(itemId);

    // Stop it.
    const stopRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/stop-list',
      headers: internalAuth,
      payload: { itemId, reason: '86 in the kitchen' },
    });
    expect(stopRes.statusCode).toBe(200);

    const stoppedRes = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { 'x-tenant-slug': 'cafe-a' },
    });
    const stoppedBody = stoppedRes.json<{ items: { id: string }[] }>();
    expect(stoppedBody.items.map((i) => i.id)).not.toContain(itemId);

    // Unstop.
    const unstopRes = await stack.app.inject({
      method: 'DELETE',
      url: `/internal/v1/catalog/stop-list/${itemId}`,
      headers: internalAuth,
    });
    expect(unstopRes.statusCode).toBe(204);

    const restoredRes = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { 'x-tenant-slug': 'cafe-a' },
    });
    const restoredBody = restoredRes.json<{ items: { id: string }[] }>();
    expect(restoredBody.items.map((i) => i.id)).toContain(itemId);
  }, 60_000);

  it('POST /publish then DELETE /publish within 5s cancels the timer — no outbox emission', async () => {
    const internalAuth = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'cafe-undo' };
    await provisionTenant(stack.app, { slug: 'cafe-undo', displayName: 'Cafe Undo' });
    const db = stack.app.get(TenantAwareDb);

    const scheduleRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/publish',
      headers: internalAuth,
    });
    expect(scheduleRes.statusCode).toBe(200);
    const scheduled = scheduleRes.json<{ scheduled: boolean; cancelAfterMs: number }>();
    expect(scheduled.scheduled).toBe(true);
    expect(scheduled.cancelAfterMs).toBe(5_000);

    // Cancel immediately.
    const cancelRes = await stack.app.inject({
      method: 'DELETE',
      url: '/internal/v1/catalog/publish',
      headers: internalAuth,
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json<{ cancelled: boolean }>().cancelled).toBe(true);

    // Wait past the original 5s window to be sure the timer would have fired
    // if it hadn't been cancelled.
    await new Promise((r) => setTimeout(r, 5_500));

    const outboxRows = await db.withoutTenant('inspect outbox after cancel', async (tx) =>
      tx.execute<{ count: string }>(
        sql`SELECT COUNT(*)::text AS count FROM outbox_events
            WHERE type IN ('catalog.menu_first_published.v1','catalog.menu_republished.v1')
              AND tenant_id IN (
                SELECT id FROM tenants WHERE slug = 'cafe-undo'
              )`,
      ),
    );
    expect(outboxRows[0]?.count).toBe('0');
  }, 30_000);

  it('first POST /publish emits MenuFirstPublishedV1; second emits MenuRepublishedV1', async () => {
    const internalAuth = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'cafe-pub' };
    await provisionTenant(stack.app, { slug: 'cafe-pub', displayName: 'Cafe Publish' });
    const db = stack.app.get(TenantAwareDb);

    // First publish.
    const first = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/publish',
      headers: internalAuth,
    });
    expect(first.statusCode).toBe(200);

    await new Promise((r) => setTimeout(r, 5_500));

    const firstRow = await db.withoutTenant('check first publish event', async (tx) =>
      tx.execute<{ type: string }>(
        sql`SELECT type FROM outbox_events
            WHERE type IN ('catalog.menu_first_published.v1','catalog.menu_republished.v1')
              AND tenant_id = (SELECT id FROM tenants WHERE slug = 'cafe-pub')
            ORDER BY occurred_at ASC`,
      ),
    );
    expect(firstRow.map((r) => r.type)).toEqual(['catalog.menu_first_published.v1']);

    // Second publish.
    const second = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/publish',
      headers: internalAuth,
    });
    expect(second.statusCode).toBe(200);

    await new Promise((r) => setTimeout(r, 5_500));

    const afterSecond = await db.withoutTenant('check second publish event', async (tx) =>
      tx.execute<{ type: string }>(
        sql`SELECT type FROM outbox_events
            WHERE type IN ('catalog.menu_first_published.v1','catalog.menu_republished.v1')
              AND tenant_id = (SELECT id FROM tenants WHERE slug = 'cafe-pub')
            ORDER BY occurred_at ASC`,
      ),
    );
    expect(afterSecond.map((r) => r.type)).toEqual([
      'catalog.menu_first_published.v1',
      'catalog.menu_republished.v1',
    ]);
  }, 30_000);

  it('PUT item with a changed slug inserts a row in menu_item_slug_aliases', async () => {
    const internalAuth = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'cafe-a' };
    const db = stack.app.get(TenantAwareDb);

    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: internalAuth,
      payload: { slug: 'aliased-cat', name: { en: 'Aliased' }, sortOrder: 0 },
    });
    expect(categoryRes.statusCode).toBe(200);
    const categoryId = categoryRes.json<{ id: string }>().id;

    const createRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/items',
      headers: internalAuth,
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

    // Rename with a new slug — should create alias row for old-name.
    const renameRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/items',
      headers: internalAuth,
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

  /*
   * ── tenant-isolation matrix for new entities (T-04a-07-03 mitigation) ──
   *
   * The canonical RLS regression net lives at
   * `packages/db/test/integration/tenant-isolation.spec.ts` — this spec adds a
   * thin smoke check using the live HTTP stack to demonstrate the same
   * invariants behave end-to-end. Direct SQL probes for cross-tenant SELECT
   * empty + INSERT error live in the db integration spec.
   */
  it('cross-tenant: tenant B cannot read or stop tenant A items via the HTTP surface', async () => {
    const authA = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'cafe-a' };
    const authB = { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': 'cafe-b' };

    const catRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: authA,
      payload: { slug: 'iso-a-cat', name: { en: 'Iso A' }, sortOrder: 0 },
    });
    expect(catRes.statusCode).toBe(200);
    const itemARes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/items',
      headers: authA,
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

    // Tenant B attempts to stop tenant A's item. RLS-backed: the upsert
    // surface refuses (the item isn't visible from B's tenant context).
    const sniff = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/stop-list',
      headers: authB,
      payload: { itemId: itemAId },
    });
    // Behaviour: either 404 (item not found in B's tenant scope) or a
    // composite-FK 5xx — either is acceptable. We assert non-200.
    expect(sniff.statusCode).not.toBe(200);
  }, 60_000);
});
