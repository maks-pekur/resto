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
if (!dockerOk) console.warn('[catalog-tenant-isolation.e2e] Docker not available — skipping.');

// Replaces the deleted pre-merge per-restaurant-label isolation spec (10.2
// plan 19). The isolation SHAPE survives unchanged — write-path id-hijack
// defense across the boundary that separates two restaurants' menus — only
// the dimension moves from within-a-tenant to tenant-vs-tenant, since a
// tenant can no longer hold two of those labels (D-03).
suite('Catalog — cross-tenant write isolation (AUDIT #2/#3)', () => {
  let stack: RealStack;
  let ownerACookie: string;
  let ownerBCookie: string;
  let tenantAId: string;
  let tenantBId: string;

  const hdrA = () => ({ cookie: ownerACookie, 'x-tenant-id': tenantAId });
  const hdrB = () => ({ cookie: ownerBCookie, 'x-tenant-id': tenantBId });

  const createCategory = async (headers: Record<string, string>, slug: string): Promise<string> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers,
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

  const createItem = async (headers: Record<string, string>, body: Record<string, unknown>) => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers,
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
    const password = 'Sup3r-Secret-Pw!';

    const slugA = `cafe-a-${randomUUID().slice(0, 8)}`;
    const emailA = `owner-a-${randomUUID().slice(0, 8)}@example.com`;
    const tenantA = await provisionTenant(stack.app, slugA, INTERNAL_TOKEN);
    tenantAId = tenantA.id;
    await runBootstrap({ tenantSlug: slugA, email: emailA, password, name: 'Owner A' });
    ownerACookie = await signInAsOperator(stack.app, emailA, password, tenantA.id);

    const slugB = `cafe-b-${randomUUID().slice(0, 8)}`;
    const emailB = `owner-b-${randomUUID().slice(0, 8)}@example.com`;
    const tenantB = await provisionTenant(stack.app, slugB, INTERNAL_TOKEN);
    tenantBId = tenantB.id;
    await runBootstrap({ tenantSlug: slugB, email: emailB, password, name: 'Owner B' });
    ownerBCookie = await signInAsOperator(stack.app, emailB, password, tenantB.id);
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  it('operator on tenant B cannot archive a tenant-A item (404)', async () => {
    const catA = await createCategory(hdrA(), `cat-${randomUUID().slice(0, 6)}`);
    const a = await createItem(hdrA(), makeItem(catA, `cola-${randomUUID().slice(0, 6)}`));
    expect(a.status).toBe(200);
    const res = await stack.app.inject({
      method: 'PATCH',
      url: `/v1/catalog/items/${a.id}/archive`,
      headers: hdrB(),
    });
    expect(res.statusCode).toBe(404);
  });

  it('operator on tenant B cannot overwrite a tenant-A item by id (404)', async () => {
    const catA = await createCategory(hdrA(), `cat-${randomUUID().slice(0, 6)}`);
    const originalSlug = `burger-${randomUUID().slice(0, 6)}`;
    const a = await createItem(hdrA(), makeItem(catA, originalSlug));
    expect(a.status).toBe(200);
    const catB = await createCategory(hdrB(), `cat-${randomUUID().slice(0, 6)}`);
    const renamedSlug = `renamed-${randomUUID().slice(0, 6)}`;
    const hijack = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: hdrB(),
      payload: { ...makeItem(catB, renamedSlug), id: a.id },
    });
    expect(hijack.statusCode).toBe(404);

    const survivor = await stack.app.inject({
      method: 'GET',
      url: `/v1/catalog/items/${a.id}`,
      headers: hdrA(),
    });
    expect(survivor.statusCode).toBe(200);
    const survivorBody = survivor.json<{ id: string; slug: string }>();
    expect(survivorBody.id).toBe(a.id);
    expect(survivorBody.slug).toBe(originalSlug);
    expect(survivorBody.slug).not.toBe(renamedSlug);
  });

  it('operator on tenant B cannot overwrite a tenant-A modifier group by id (404, not 500)', async () => {
    const created = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/modifier-groups',
      headers: hdrA(),
      payload: { name: { en: 'Sauce' }, minSelectable: 0, maxSelectable: 1, isRequired: false },
    });
    expect(created.statusCode).toBe(200);
    const groupId = created.json<{ id: string }>().id;

    const hijack = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/modifier-groups',
      headers: hdrB(),
      payload: {
        id: groupId,
        name: { en: 'Hijacked' },
        minSelectable: 0,
        maxSelectable: 1,
        isRequired: false,
      },
    });
    expect(hijack.statusCode).toBe(404);
    expect(hijack.json<{ code?: string }>().code).toBe('catalog.modifier_group_not_found');
  });

  it("cannot create an item under another tenant's category (404)", async () => {
    const catA = await createCategory(hdrA(), `cat-${randomUUID().slice(0, 6)}`);
    const res = await createItem(hdrB(), makeItem(catA, `x-${randomUUID().slice(0, 6)}`));
    expect(res.status).toBe(404);
  });

  it('both tenants can hold the same slug without overwriting each other', async () => {
    const catA = await createCategory(hdrA(), `cat-${randomUUID().slice(0, 6)}`);
    const catB = await createCategory(hdrB(), `cat-${randomUUID().slice(0, 6)}`);
    const shared = `pizza-${randomUUID().slice(0, 6)}`;
    const a = await createItem(hdrA(), makeItem(catA, shared));
    const b = await createItem(hdrB(), makeItem(catB, shared));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.id).not.toBe(b.id);
  });

  it('a write with no tenant context is rejected before reaching catalog (403, not 500)', async () => {
    const catA = await createCategory(hdrA(), `cat-${randomUUID().slice(0, 6)}`);
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: { cookie: ownerACookie },
      payload: makeItem(catA, `nb-${randomUUID().slice(0, 6)}`),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json<{ code?: string }>().code).toBe('auth.tenant_context_missing');
  });
});
