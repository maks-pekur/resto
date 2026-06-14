import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { provisionTenant, runBootstrap, signInAsOperator } from './helpers/operator-fixture';

const INTERNAL_TOKEN = 'integration-test-token-1234567890';
const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;
if (!dockerOk) console.warn('[catalog-brand-read-isolation.e2e] Docker not available — skipping.');

suite('Catalog — brand read-path isolation (AUDIT #7/#8/#9)', () => {
  let stack: RealStack;
  let ownerCookie: string;
  let tenantId: string;
  let tenantSlug: string;
  let brandASlug: string;
  let brandBSlug: string;

  const w = (brand: string) => ({
    cookie: ownerCookie,
    'x-tenant-id': tenantId,
    'x-brand-slug': brand,
  });
  const readMenu = (brand: string | null) =>
    stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: brand
        ? { 'x-tenant-slug': tenantSlug, 'x-brand-slug': brand }
        : { 'x-tenant-slug': tenantSlug },
    });

  const createBrand = async (slug: string): Promise<void> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/me/brands',
      headers: { cookie: ownerCookie, 'x-tenant-id': tenantId },
      payload: { slug, displayName: slug },
    });
    expect(res.statusCode).toBe(201);
  };
  const createCategory = async (brand: string): Promise<string> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: w(brand),
      payload: { slug: `cat-${randomUUID().slice(0, 6)}`, name: { en: 'C' }, sortOrder: 0 },
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ id: string }>().id;
  };
  const createGroup = async (brand: string): Promise<string> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/modifier-groups',
      headers: w(brand),
      payload: {
        name: { en: `g-${randomUUID().slice(0, 6)}` },
        minSelectable: 0,
        maxSelectable: 1,
        isRequired: false,
      },
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ id: string }>().id;
  };
  const createItem = async (brand: string, categoryId: string): Promise<string> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: w(brand),
      payload: {
        categoryId,
        slug: `it-${randomUUID().slice(0, 6)}`,
        name: { en: 'I' },
        basePrice: '1.00',
        currency: 'USD',
        status: 'published',
      },
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ id: string }>().id;
  };
  const publish = async (brand: string): Promise<void> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/publish',
      headers: w(brand),
    });
    expect(res.statusCode).toBe(200);
  };

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    stack = await startRealStack();
    tenantSlug = `cafe-${randomUUID().slice(0, 8)}`;
    const email = `owner-${randomUUID().slice(0, 8)}@example.com`;
    const password = 'Sup3r-Secret-Pw!';
    const tenant = await provisionTenant(stack.app, tenantSlug, INTERNAL_TOKEN);
    tenantId = tenant.id;
    await runBootstrap({ tenantSlug, email, password, name: 'Owner' });
    ownerCookie = await signInAsOperator(stack.app, email, password, tenant.id);
    brandASlug = `brand-a-${randomUUID().slice(0, 6)}`;
    brandBSlug = `brand-b-${randomUUID().slice(0, 6)}`;
    await createBrand(brandASlug);
    await createBrand(brandBSlug);
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  it("brand A's published menu contains only brand A's modifier groups (#7)", async () => {
    const gA = await createGroup(brandASlug);
    const gB = await createGroup(brandBSlug);
    const catA = await createCategory(brandASlug);
    await createItem(brandASlug, catA);
    await publish(brandASlug);
    const res = await readMenu(brandASlug);
    expect(res.statusCode).toBe(200);
    const ids = res.json<{ modifierGroups: { id: string }[] }>().modifierGroups.map((g) => g.id);
    expect(ids).toContain(gA);
    expect(ids).not.toContain(gB);
  });

  it('a public menu read with no resolved brand returns 404 (#8)', async () => {
    const res = await readMenu(null);
    expect(res.statusCode).toBe(404);
  });

  it("stopping a brand-A item does not affect brand B's menu (#9)", async () => {
    const catA = await createCategory(brandASlug);
    const itemA = await createItem(brandASlug, catA);
    await publish(brandASlug);
    const catB = await createCategory(brandBSlug);
    const itemB = await createItem(brandBSlug, catB);
    await publish(brandBSlug);
    const stop = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/stop-list',
      headers: w(brandASlug),
      payload: { itemId: itemA },
    });
    expect(stop.statusCode).toBe(200);
    const menuB = await readMenu(brandBSlug);
    expect(menuB.statusCode).toBe(200);
    const bIds = menuB.json<{ items: { id: string }[] }>().items.map((i) => i.id);
    expect(bIds).toContain(itemB);
    expect(bIds).not.toContain(itemA);
  });
});
