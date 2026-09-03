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
if (!dockerOk) console.warn('[catalog-tenant-read-isolation.e2e] Docker not available — skipping.');

// Replaces the deleted pre-merge per-restaurant-label read-isolation spec
// (10.2 plan 19). Same isolation shape, one fewer dimension: two tenants
// instead of two labels inside one tenant (D-03).
suite('Catalog — cross-tenant read-path isolation (AUDIT #7/#8/#9)', () => {
  let stack: RealStack;
  let ownerACookie: string;
  let ownerBCookie: string;
  let tenantAId: string;
  let tenantBId: string;
  let tenantASlug: string;
  let tenantBSlug: string;

  const wA = () => ({ cookie: ownerACookie, 'x-tenant-id': tenantAId });
  const wB = () => ({ cookie: ownerBCookie, 'x-tenant-id': tenantBId });
  // Guest reads resolve by HOST (D-22), not by an operator-style header —
  // `provisionTenant` already writes the `<slug>.menu.resto.app` domain row.
  const readMenu = (slug: string | null) =>
    stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: slug ? { host: `${slug}.menu.resto.app` } : {},
    });

  const createLocation = async (
    headers: Record<string, string>,
    label: string,
  ): Promise<string> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/tenancy/locations',
      headers,
      payload: {
        name: `${label} location`,
        address: '1 Test Street, London',
        latitude: 51.5074,
        longitude: -0.1278,
      },
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ id: string }>().id;
  };
  const createCategory = async (headers: Record<string, string>): Promise<string> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers,
      payload: { slug: `cat-${randomUUID().slice(0, 6)}`, name: { en: 'C' }, sortOrder: 0 },
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ id: string }>().id;
  };
  const createGroup = async (headers: Record<string, string>): Promise<string> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/modifier-groups',
      headers,
      payload: {
        name: { en: `g-${randomUUID().slice(0, 6)}` },
        display: 'tabs',
        behaviour: 'one',
        isRequired: false,
      },
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ id: string }>().id;
  };
  const createItem = async (
    headers: Record<string, string>,
    categoryId: string,
  ): Promise<string> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers,
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
  const publish = async (headers: Record<string, string>): Promise<void> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/publish',
      headers,
    });
    expect(res.statusCode).toBe(200);
  };

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    stack = await startRealStack();
    const password = 'Sup3r-Secret-Pw!';

    tenantASlug = `cafe-a-${randomUUID().slice(0, 8)}`;
    const emailA = `owner-a-${randomUUID().slice(0, 8)}@example.com`;
    const tenantA = await provisionTenant(stack.app, tenantASlug, INTERNAL_TOKEN);
    tenantAId = tenantA.id;
    await runBootstrap({ tenantSlug: tenantASlug, email: emailA, password, name: 'Owner A' });
    ownerACookie = await signInAsOperator(stack.app, emailA, password, tenantA.id);

    tenantBSlug = `cafe-b-${randomUUID().slice(0, 8)}`;
    const emailB = `owner-b-${randomUUID().slice(0, 8)}@example.com`;
    const tenantB = await provisionTenant(stack.app, tenantBSlug, INTERNAL_TOKEN);
    tenantBId = tenantB.id;
    await runBootstrap({ tenantSlug: tenantBSlug, email: emailB, password, name: 'Owner B' });
    ownerBCookie = await signInAsOperator(stack.app, emailB, password, tenantB.id);
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  it("tenant A's published menu contains only tenant A's modifier groups (#7)", async () => {
    const gA = await createGroup(wA());
    const gB = await createGroup(wB());
    const catA = await createCategory(wA());
    await createItem(wA(), catA);
    await publish(wA());
    const res = await readMenu(tenantASlug);
    expect(res.statusCode).toBe(200);
    const ids = res.json<{ modifierGroups: { id: string }[] }>().modifierGroups.map((g) => g.id);
    expect(ids).toContain(gA);
    expect(ids).not.toContain(gB);
  });

  it('a public menu read with no resolved tenant returns 404 (#8)', async () => {
    const res = await readMenu(null);
    expect(res.statusCode).toBe(404);
  });

  it("stopping a tenant-A item does not affect tenant B's menu (#9)", async () => {
    const catA = await createCategory(wA());
    const itemA = await createItem(wA(), catA);
    await publish(wA());
    const catB = await createCategory(wB());
    const itemB = await createItem(wB(), catB);
    await publish(wB());
    const locationA = await createLocation(wA(), 'A');
    const stop = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/stop-list',
      headers: { ...wA(), 'x-location-id': locationA },
      payload: { itemId: itemA },
    });
    expect(stop.statusCode).toBe(200);
    const menuB = await readMenu(tenantBSlug);
    expect(menuB.statusCode).toBe(200);
    const bIds = menuB.json<{ items: { id: string }[] }>().items.map((i) => i.id);
    expect(bIds).toContain(itemB);
    expect(bIds).not.toContain(itemA);
  });
});
