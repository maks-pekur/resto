import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { schema, TenantAwareDb } from '@resto/db';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { provisionTenant, runBootstrap, signInAsOperator } from './helpers/operator-fixture';
import { AUTH_DRIZZLE_TOKEN } from '../../src/contexts/identity/identity.tokens';
import type { AuthDrizzle } from '../../src/contexts/identity/infrastructure/better-auth/auth-db';

const INTERNAL_TOKEN = 'integration-test-token-1234567890';
const PASSWORD = 'Sup3r-Secret-Pw!';
const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;
if (!dockerOk) console.warn('[catalog-brand-scope.e2e] Docker not available — skipping.');

suite('Catalog — per-operator brand-scope enforcement (AUDIT #15)', () => {
  let stack: RealStack;
  let ownerCookie: string;
  let adminCookie: string;
  let tenantId: string;
  let brandASlug: string;
  let brandBSlug: string;
  let categoryAId: string;
  let categoryBId: string;

  const hdr = (cookie: string, brandSlug: string) => ({
    cookie,
    'x-tenant-id': tenantId,
    'x-brand-slug': brandSlug,
  });

  const createBrand = async (slug: string): Promise<string> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/me/brands',
      headers: { cookie: ownerCookie, 'x-tenant-id': tenantId },
      payload: { slug, displayName: slug },
    });
    expect(res.statusCode).toBe(201);
    const db = stack.app.get(TenantAwareDb);
    const rows = await db.withoutTenant('lookup brand id', (tx) =>
      tx
        .select({ id: schema.brands.id })
        .from(schema.brands)
        .where(and(eq(schema.brands.tenantId, tenantId), eq(schema.brands.slug, slug))),
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new Error(`brand ${slug} not found after create`);
    return id;
  };

  const createCategory = async (brandSlug: string, slug: string): Promise<string> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: hdr(ownerCookie, brandSlug),
      payload: { slug, name: { en: slug }, sortOrder: 0 },
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ id: string }>().id;
  };

  const itemPayload = (categoryId: string) => ({
    categoryId,
    slug: `item-${randomUUID().slice(0, 8)}`,
    name: { en: 'Item' },
    basePrice: '2.50',
    currency: 'USD',
    status: 'draft',
  });

  const postItem = (cookie: string, brandSlug: string, categoryId: string) =>
    stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: hdr(cookie, brandSlug),
      payload: itemPayload(categoryId),
    });

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    stack = await startRealStack();

    const slug = `cafe-${randomUUID().slice(0, 8)}`;
    const ownerEmail = `owner-${randomUUID().slice(0, 8)}@example.com`;
    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    tenantId = tenant.id;
    await runBootstrap({ tenantSlug: slug, email: ownerEmail, password: PASSWORD, name: 'Owner' });
    ownerCookie = await signInAsOperator(stack.app, ownerEmail, PASSWORD, tenantId);

    brandASlug = `brand-a-${randomUUID().slice(0, 8)}`;
    brandBSlug = `brand-b-${randomUUID().slice(0, 8)}`;
    const brandAId = await createBrand(brandASlug);
    await createBrand(brandBSlug);
    categoryAId = await createCategory(brandASlug, 'cat-a');
    categoryBId = await createCategory(brandBSlug, 'cat-b');

    // An `admin` operator (non-owner, so NOT guard-bypassed) carrying
    // menu:update, explicitly scoped to brand A only.
    const adminEmail = `admin-${randomUUID().slice(0, 8)}@example.com`;
    const throwaway = `mt-${randomUUID().slice(0, 8)}`;
    await provisionTenant(stack.app, throwaway, INTERNAL_TOKEN);
    const { userId: adminUserId } = await runBootstrap({
      tenantSlug: throwaway,
      email: adminEmail,
      password: PASSWORD,
      name: 'Admin',
    });
    const adminMemberId = randomUUID();
    const authDb = stack.app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
    await authDb.db.insert(schema.member).values({
      id: adminMemberId,
      organizationId: tenantId,
      userId: adminUserId,
      role: 'admin',
      createdAt: new Date(),
    });
    adminCookie = await signInAsOperator(stack.app, adminEmail, PASSWORD, tenantId);

    const runtimeDb = stack.app.get(TenantAwareDb);
    await runtimeDb.withoutTenant('seed admin brand scope', (tx) =>
      tx.insert(schema.memberBrandScope).values({
        memberId: adminMemberId,
        brandId: brandAId,
        tenantId,
      }),
    );
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  it('allows a brand-scoped operator to write within their scoped brand', async () => {
    const res = await postItem(adminCookie, brandASlug, categoryAId);
    expect(res.statusCode).toBe(200);
  });

  it('forbids a brand-scoped operator from writing in an out-of-scope brand (403)', async () => {
    const res = await postItem(adminCookie, brandBSlug, categoryBId);
    expect(res.statusCode).toBe(403);
    expect(res.json<{ code?: string }>().code).toBe('brand.access_denied');
  });

  it('lets an owner write in any brand (baseRole bypass)', async () => {
    const res = await postItem(ownerCookie, brandBSlug, categoryBId);
    expect(res.statusCode).toBe(200);
  });
});
