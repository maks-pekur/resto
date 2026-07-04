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
import {
  extractCookies,
  provisionTenant,
  runBootstrap,
  signInAsOperator,
} from './helpers/operator-fixture';
import { AUTH_DRIZZLE_TOKEN } from '../../src/contexts/identity/identity.tokens';
import type { AuthDrizzle } from '../../src/contexts/identity/infrastructure/better-auth/auth-db';

const INTERNAL_TOKEN = 'integration-test-token-1234567890';
const PASSWORD = 'Sup3r-Secret-Pw-BrandScope!';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn(
    '[roles-brand-scope-orthogonality.e2e] Docker not available — skipping integration tests.',
  );
}

suite(
  'D-03 / RBAC-09: custom role does not widen brand reach — effective access = brand scope ∩ role permissions',
  () => {
    let stack: RealStack;
    let ownerCookie: string;
    let memberCookie: string;
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
      const rows = await db.withoutTenant('lookup brand id for d03 test', (tx) =>
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

      const slug = `d03-${randomUUID().slice(0, 8)}`;
      const ownerEmail = `owner-d03-${randomUUID().slice(0, 8)}@example.com`;
      const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
      tenantId = tenant.id;
      await runBootstrap({
        tenantSlug: slug,
        email: ownerEmail,
        password: PASSWORD,
        name: 'D03 Owner',
      });
      ownerCookie = await signInAsOperator(stack.app, ownerEmail, PASSWORD, tenantId);

      brandASlug = `ba-${randomUUID().slice(0, 8)}`;
      brandBSlug = `bb-${randomUUID().slice(0, 8)}`;
      const brandAId = await createBrand(brandASlug);
      await createBrand(brandBSlug);
      categoryAId = await createCategory(brandASlug, `cat-a-${randomUUID().slice(0, 8)}`);
      categoryBId = await createCategory(brandBSlug, `cat-b-${randomUUID().slice(0, 8)}`);

      const roleRes = await stack.app.inject({
        method: 'POST',
        url: '/v1/roles',
        headers: {
          'content-type': 'application/json',
          cookie: ownerCookie,
          'x-tenant-id': tenantId,
        },
        payload: {
          roleName: 'menu-editor',
          permission: { menu: ['read', 'update'], tenant: ['read'] },
        },
      });
      expect(roleRes.statusCode).toBe(201);
      const menuEditorSlug = roleRes.json<{ roleSlug: string }>().roleSlug;

      const memberEmail = `mem-d03-${randomUUID().slice(0, 8)}@example.com`;
      const throwaway = `d03-mt-${randomUUID().slice(0, 8)}`;
      await provisionTenant(stack.app, throwaway, INTERNAL_TOKEN);
      const { userId: memberUserId } = await runBootstrap({
        tenantSlug: throwaway,
        email: memberEmail,
        password: PASSWORD,
        name: 'D03 Member',
      });
      const memberId = randomUUID();
      const authDb = stack.app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
      await authDb.db.insert(schema.member).values({
        id: memberId,
        organizationId: tenantId,
        userId: memberUserId,
        role: menuEditorSlug,
        createdAt: new Date(),
      });
      memberCookie = await signInAsOperator(stack.app, memberEmail, PASSWORD, tenantId);

      const runtimeDb = stack.app.get(TenantAwareDb);
      await runtimeDb.withoutTenant('seed member brand scope for d03', (tx) =>
        tx.insert(schema.memberBrandScope).values({
          memberId,
          brandId: brandAId,
          tenantId,
        }),
      );

      const pinRes = await stack.app.inject({
        method: 'POST',
        url: '/v1/me/set-active-brand',
        headers: {
          'content-type': 'application/json',
          cookie: memberCookie,
          'x-tenant-id': tenantId,
        },
        payload: { brandId: brandAId },
      });
      if (pinRes.statusCode !== 200) {
        throw new Error(
          `Failed to pin Brand A for custom-role member: ${pinRes.statusCode} ${pinRes.body}`,
        );
      }
      memberCookie = extractCookies(pinRes.headers['set-cookie']) || memberCookie;
    }, 180_000);

    afterAll(async () => {
      if (stack) await stopRealStack(stack);
    });

    it('custom-role member writes in their scoped brand (200)', async () => {
      const res = await postItem(memberCookie, brandASlug, categoryAId);
      expect(res.statusCode).toBe(200);
    });

    it('custom-role member gets 404 in out-of-scope brand (existence-hiding, D-03)', async () => {
      const res = await postItem(memberCookie, brandBSlug, categoryBId);
      expect(res.statusCode).toBe(404);
    });

    it('owner writes in Brand B (baseRole bypass control — proves 404 above is scope-driven)', async () => {
      const res = await postItem(ownerCookie, brandBSlug, categoryBId);
      expect(res.statusCode).toBe(200);
    });
  },
);
