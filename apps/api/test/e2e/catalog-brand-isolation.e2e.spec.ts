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
if (!dockerOk) console.warn('[catalog-brand-isolation.e2e] Docker not available — skipping.');

suite('Catalog — brand data isolation (AUDIT #2/#3)', () => {
  let stack: RealStack;
  let ownerCookie: string;
  let tenantId: string;
  let brandASlug: string;
  let brandBSlug: string;

  const hdr = (brandSlug: string) => ({
    cookie: ownerCookie,
    'x-tenant-id': tenantId,
    'x-brand-slug': brandSlug,
  });

  const createBrand = async (slug: string, displayName: string): Promise<void> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/me/brands',
      headers: { cookie: ownerCookie, 'x-tenant-id': tenantId },
      payload: { slug, displayName },
    });
    expect(res.statusCode).toBe(201);
  };

  const createCategory = async (brandSlug: string, slug: string): Promise<string> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: hdr(brandSlug),
      payload: { slug, name: { en: slug }, sortOrder: 0 },
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ id: string }>().id;
  };

  const makeItem = (categoryId: string, slug: string) => ({
    categoryId,
    slug,
    name: { en: 'X' },
    basePrice: '1.00',
    currency: 'USD',
    status: 'draft',
  });

  const createItem = async (brandSlug: string, body: Record<string, unknown>) => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: hdr(brandSlug),
      payload: body,
    });
    return {
      status: res.statusCode,
      id: res.statusCode === 200 ? res.json<{ id: string }>().id : undefined,
    };
  };

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    stack = await startRealStack();
    const slug = `cafe-${randomUUID().slice(0, 8)}`;
    const email = `owner-${randomUUID().slice(0, 8)}@example.com`;
    const password = 'Sup3r-Secret-Pw!';
    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    tenantId = tenant.id;
    await runBootstrap({ tenantSlug: slug, email, password, name: 'Owner' });
    ownerCookie = await signInAsOperator(stack.app, email, password, tenant.id);
    brandASlug = `brand-a-${randomUUID().slice(0, 6)}`;
    brandBSlug = `brand-b-${randomUUID().slice(0, 6)}`;
    await createBrand(brandASlug, 'Brand A');
    await createBrand(brandBSlug, 'Brand B');
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  it('operator on brand B cannot archive a brand-A item (404)', async () => {
    const catA = await createCategory(brandASlug, `cat-${randomUUID().slice(0, 6)}`);
    const a = await createItem(brandASlug, makeItem(catA, `cola-${randomUUID().slice(0, 6)}`));
    expect(a.status).toBe(200);
    const res = await stack.app.inject({
      method: 'PATCH',
      url: `/v1/catalog/items/${a.id}/archive`,
      headers: hdr(brandBSlug),
    });
    expect(res.statusCode).toBe(404);
  });

  it('operator on brand B cannot overwrite a brand-A item by id (404)', async () => {
    const catA = await createCategory(brandASlug, `cat-${randomUUID().slice(0, 6)}`);
    const a = await createItem(brandASlug, makeItem(catA, `burger-${randomUUID().slice(0, 6)}`));
    expect(a.status).toBe(200);
    const catB = await createCategory(brandBSlug, `cat-${randomUUID().slice(0, 6)}`);
    const hijack = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: hdr(brandBSlug),
      payload: { ...makeItem(catB, `renamed-${randomUUID().slice(0, 6)}`), id: a.id },
    });
    expect(hijack.statusCode).toBe(404);
  });

  it("cannot create an item under another brand's category (404)", async () => {
    const catA = await createCategory(brandASlug, `cat-${randomUUID().slice(0, 6)}`);
    const res = await createItem(brandBSlug, makeItem(catA, `x-${randomUUID().slice(0, 6)}`));
    expect(res.status).toBe(404);
  });

  it('both brands can hold the same slug without overwriting each other', async () => {
    const catA = await createCategory(brandASlug, `cat-${randomUUID().slice(0, 6)}`);
    const catB = await createCategory(brandBSlug, `cat-${randomUUID().slice(0, 6)}`);
    const shared = `pizza-${randomUUID().slice(0, 6)}`;
    const a = await createItem(brandASlug, makeItem(catA, shared));
    const b = await createItem(brandBSlug, makeItem(catB, shared));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.id).not.toBe(b.id);
  });

  it('a write with no active brand is a clean 400, not a 500', async () => {
    const catA = await createCategory(brandASlug, `cat-${randomUUID().slice(0, 6)}`);
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: { cookie: ownerCookie, 'x-tenant-id': tenantId },
      payload: makeItem(catA, `nb-${randomUUID().slice(0, 6)}`),
    });
    expect(res.statusCode).toBe(400);
  });
});
