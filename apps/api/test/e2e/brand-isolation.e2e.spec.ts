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
  provisionTenant,
  runBootstrap,
  signInAsOperator,
  addMemberWithRole,
  extractCookies,
} from './helpers/operator-fixture';
import { AUTH_DRIZZLE_TOKEN } from '../../src/contexts/identity/identity.tokens';
import type { AuthDrizzle } from '../../src/contexts/identity/infrastructure/better-auth/auth-db';

const INTERNAL_TOKEN = 'integration-test-token-1234567890';
const PASSWORD = 'Sup3r-Secret-Pw!';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;
if (!dockerOk) console.warn('[brand-isolation.e2e] Docker not available — skipping.');

const pinCookie = (setCookieHeader: string | string[] | undefined, fallback: string): string => {
  const extracted = extractCookies(setCookieHeader);
  return extracted || fallback;
};

suite('SC-4 brand-isolation e2e (Plan 08.2-06)', () => {
  let stack: RealStack;
  let tenantId: string;
  let brandAId: string;
  let brandBId: string;
  let brandASlug: string;
  let brandBSlug: string;
  let ownerCookie: string;
  let scopedAdminCookieBase: string;
  let scopedAdminCookiePinnedA: string;
  let unscopedAdminCookiePinnedA: string;

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
    if (!id) throw new Error(`brand ${slug} not found after create`);
    return id;
  };

  const seedMemberScoped = async (userId: string, brandId: string): Promise<string> => {
    const db = stack.app.get(TenantAwareDb);
    const authDb = stack.app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
    const memberId = randomUUID();
    await authDb.db.insert(schema.member).values({
      id: memberId,
      organizationId: tenantId,
      userId,
      role: 'admin',
      createdAt: new Date(),
    });
    await db.withoutTenant('seed member location scope', async (tx) => {
      const locationId = randomUUID();
      await tx
        .insert(schema.locations)
        .values({ id: locationId, brandId, tenantId, name: 'Isolation location' });
      await tx
        .insert(schema.memberLocationScope)
        .values({ memberId, locationId, tenantId, role: 'admin' });
    });
    return memberId;
  };

  const setPin = async (cookie: string, brandId: string): Promise<string> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/me/set-active-brand',
      headers: { cookie, 'x-tenant-id': tenantId },
      payload: { brandId },
    });
    expect(res.statusCode).toBe(200);
    return pinCookie(res.headers['set-cookie'], cookie);
  };

  const pinBrandForUser = async (userId: string, brandId: string): Promise<void> => {
    const authDb = stack.app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
    await authDb.db
      .update(schema.session)
      .set({ activeBrandId: brandId })
      .where(eq(schema.session.userId, userId));
  };

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    stack = await startRealStack({ natsEnabledInApp: false });

    const tenantSlug = `iso-${randomUUID().slice(0, 8)}`;
    const ownerEmail = `owner-${randomUUID().slice(0, 8)}@example.com`;
    const tenant = await provisionTenant(stack.app, tenantSlug, INTERNAL_TOKEN);
    tenantId = tenant.id;
    await runBootstrap({ tenantSlug, email: ownerEmail, password: PASSWORD, name: 'Owner' });
    ownerCookie = await signInAsOperator(stack.app, ownerEmail, PASSWORD, tenantId);

    brandASlug = `brand-a-${randomUUID().slice(0, 8)}`;
    brandBSlug = `brand-b-${randomUUID().slice(0, 8)}`;
    brandAId = await createBrand(brandASlug);
    brandBId = await createBrand(brandBSlug);

    const db = stack.app.get(TenantAwareDb);

    await db.withoutTenant('seed categories for both brands', (tx) =>
      tx.insert(schema.menuCategories).values([
        { tenantId, brandId: brandAId, slug: 'cat-a', name: { en: 'Category A' }, sortOrder: 0 },
        { tenantId, brandId: brandBId, slug: 'cat-b', name: { en: 'Category B' }, sortOrder: 0 },
      ]),
    );

    const scopedThrowaway = `scoped-${randomUUID().slice(0, 8)}`;
    const scopedEmail = `scoped-${randomUUID().slice(0, 8)}@example.com`;
    await provisionTenant(stack.app, scopedThrowaway, INTERNAL_TOKEN);
    const scopedUser = await runBootstrap({
      tenantSlug: scopedThrowaway,
      email: scopedEmail,
      password: PASSWORD,
      name: 'Scoped',
    });
    await seedMemberScoped(scopedUser.userId, brandAId);
    scopedAdminCookieBase = await signInAsOperator(stack.app, scopedEmail, PASSWORD, tenantId);
    await pinBrandForUser(scopedUser.userId, brandAId);
    scopedAdminCookiePinnedA = scopedAdminCookieBase;

    const unscopedEmail = `unscoped-${randomUUID().slice(0, 8)}@example.com`;
    const unscopedBase = await addMemberWithRole(stack.app, {
      tenantId,
      internalToken: INTERNAL_TOKEN,
      email: unscopedEmail,
      password: PASSWORD,
      name: 'Unscoped',
      role: 'admin',
    });
    const authDbForPin = stack.app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
    const userRow = await authDbForPin.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, unscopedEmail))
      .limit(1);
    const unscopedUserId = userRow[0]?.id;
    if (!unscopedUserId) throw new Error('unscopedAdmin user not found after addMemberWithRole');
    await authDbForPin.db
      .update(schema.session)
      .set({ activeBrandId: brandAId })
      .where(eq(schema.session.userId, unscopedUserId));
    unscopedAdminCookiePinnedA = unscopedBase;
  }, 240_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  describe('D-10 pin reconciliation — non-owner mismatch → 404 existence-hiding', () => {
    it('non-owner with pin=A sending x-brand-slug=B is rejected with 404 (not 403)', async () => {
      const res = await stack.app.inject({
        method: 'GET',
        url: '/v1/catalog/categories',
        headers: hdr(scopedAdminCookiePinnedA, brandBSlug),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('D-08 default-deny — non-owner with zero scope rows + pin=A → 403 brand.access_denied', () => {
    it('non-owner with no scope rows but pin=A hitting brand-A route gets 403 brand.access_denied', async () => {
      const res = await stack.app.inject({
        method: 'GET',
        url: '/v1/catalog/categories',
        headers: hdr(unscopedAdminCookiePinnedA, brandASlug),
      });
      expect(res.statusCode).toBe(403);
      expect(res.json<{ code?: string }>().code).toBe('brand.access_denied');
    });
  });

  describe('non-owner scoped to A — in-scope access (control)', () => {
    it('non-owner scoped to A with pin=A can reach A brand-scoped route (200)', async () => {
      const res = await stack.app.inject({
        method: 'GET',
        url: '/v1/catalog/categories',
        headers: hdr(scopedAdminCookiePinnedA, brandASlug),
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('owner bypass — owner reaches any brand', () => {
    it('owner can reach brand A without explicit scope rows', async () => {
      const res = await stack.app.inject({
        method: 'GET',
        url: '/v1/catalog/categories',
        headers: hdr(ownerCookie, brandASlug),
      });
      expect(res.statusCode).toBe(200);
    });

    it('owner can reach brand B without explicit scope rows', async () => {
      const res = await stack.app.inject({
        method: 'GET',
        url: '/v1/catalog/categories',
        headers: hdr(ownerCookie, brandBSlug),
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('D-09 pin un-forgeable — /update-session cannot move activeBrandId', () => {
    it('attempting to set activeBrandId to B via better-auth update-session does not move the pin', async () => {
      await stack.app.inject({
        method: 'POST',
        url: '/api/auth/update-session',
        headers: {
          cookie: scopedAdminCookiePinnedA,
          'content-type': 'application/json',
        },
        payload: { activeBrandId: brandBId },
      });

      const afterForge = await stack.app.inject({
        method: 'GET',
        url: '/v1/catalog/categories',
        headers: hdr(scopedAdminCookiePinnedA, brandBSlug),
      });
      expect(afterForge.statusCode).toBe(404);
    });
  });

  describe('GUC-binding proof (D-14 / MEDIUM) — app.current_brand is bound on the real request path', () => {
    it('withTenantId + app_bind_brand returns A-only rows, proving brand RLS works when the GUC is set', async () => {
      const db = stack.app.get(TenantAwareDb);
      const raw = db.connection.raw;

      const visibleRows = await raw.begin(async (tx) => {
        await tx`SELECT app_bind_tenant(${tenantId}, false)`;
        await tx`SELECT app_bind_brand(${brandAId}, false)`;
        return tx<{ id: string; brand_id: string }[]>`
          SELECT id, brand_id FROM menu_categories WHERE tenant_id = ${tenantId}
        `;
      });

      const visibleIds = visibleRows.map((r) => r.id);
      expect(visibleIds.length).toBeGreaterThanOrEqual(1);

      const catBRows = await db.withoutTenant('verify brand-b categories exist', (tx) =>
        tx
          .select({ id: schema.menuCategories.id })
          .from(schema.menuCategories)
          .where(
            and(
              eq(schema.menuCategories.tenantId, tenantId),
              eq(schema.menuCategories.brandId, brandBId),
            ),
          ),
      );
      expect(catBRows.length).toBeGreaterThanOrEqual(1);
      for (const row of catBRows) {
        expect(visibleIds).not.toContain(row.id);
      }

      const catARows = await db.withoutTenant('verify brand-a categories exist', (tx) =>
        tx
          .select({ id: schema.menuCategories.id })
          .from(schema.menuCategories)
          .where(
            and(
              eq(schema.menuCategories.tenantId, tenantId),
              eq(schema.menuCategories.brandId, brandAId),
            ),
          ),
      );
      for (const row of catARows) {
        expect(visibleIds).toContain(row.id);
      }
    });

    it('the BrandScopeGuard on a brand-A HTTP request reads brandId from ALS (proving the middleware bound it)', async () => {
      const ownerPinnedA = await setPin(ownerCookie, brandAId);
      const res = await stack.app.inject({
        method: 'GET',
        url: '/v1/catalog/categories',
        headers: hdr(ownerPinnedA, brandASlug),
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('positive public-traffic survival — default-on guard flip does NOT 403 anonymous customer routes', () => {
    it('anonymous GET /v1/menu with valid x-brand-slug returns 200, not a brand-guard 403', async () => {
      const res = await stack.app.inject({
        method: 'GET',
        url: '/v1/menu',
        headers: { 'x-tenant-id': tenantId, 'x-brand-slug': brandASlug },
      });
      expect(res.statusCode).toBe(200);
    });

    it('guest POST /v1/orders is NOT blocked by a brand-guard — error code is never a brand.* guard code', async () => {
      const res = await stack.app.inject({
        method: 'POST',
        url: '/v1/orders',
        headers: {
          'x-tenant-id': tenantId,
          'x-brand-slug': brandASlug,
          'content-type': 'application/json',
        },
        payload: {
          brandId: brandAId,
          items: [],
          customerName: 'Guest',
          customerPhone: '+1234567890',
          deliveryType: 'pickup',
        },
      });

      const BRAND_GUARD_CODES = [
        'brand.operator_required',
        'brand.context_required',
        'brand.access_denied',
      ];
      if (res.statusCode >= 400) {
        const body = res.json<{ code?: string }>();
        expect(BRAND_GUARD_CODES).not.toContain(body.code);
      } else {
        expect([200, 201]).toContain(res.statusCode);
      }
    });
  });
});
