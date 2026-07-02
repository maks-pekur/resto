import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  extractCookies,
} from './helpers/operator-fixture';
import { AUTH_DRIZZLE_TOKEN } from '../../src/contexts/identity/identity.tokens';
import type { AuthDrizzle } from '../../src/contexts/identity/infrastructure/better-auth/auth-db';

const INTERNAL_TOKEN = 'integration-test-token-1234567890';
const PASSWORD = 'Sup3r-Secret-Pw!';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;
if (!dockerOk) console.warn('[brand-payout-isolation.e2e] Docker not available — skipping.');

suite('D-14 cross-brand payout/payment app-layer boundary (Plan 08.2-06)', () => {
  let stack: RealStack;
  let tenantId: string;
  let brandAId: string;
  let brandASlug: string;
  let brandBSlug: string;
  let ownerCookie: string;
  let scopedAdminCookiePinnedA: string;

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

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    stack = await startRealStack({ natsEnabledInApp: false });

    const tenantSlug = `pay-iso-${randomUUID().slice(0, 8)}`;
    const ownerEmail = `owner-${randomUUID().slice(0, 8)}@example.com`;
    const tenant = await provisionTenant(stack.app, tenantSlug, INTERNAL_TOKEN);
    tenantId = tenant.id;
    await runBootstrap({ tenantSlug, email: ownerEmail, password: PASSWORD, name: 'Owner' });
    ownerCookie = await signInAsOperator(stack.app, ownerEmail, PASSWORD, tenantId);

    brandASlug = `pay-a-${randomUUID().slice(0, 8)}`;
    brandBSlug = `pay-b-${randomUUID().slice(0, 8)}`;
    brandAId = await createBrand(brandASlug);
    await createBrand(brandBSlug);

    const scopedThrowaway = `pscoped-${randomUUID().slice(0, 8)}`;
    const scopedEmail = `pscoped-${randomUUID().slice(0, 8)}@example.com`;
    await provisionTenant(stack.app, scopedThrowaway, INTERNAL_TOKEN);
    const scopedUser = await runBootstrap({
      tenantSlug: scopedThrowaway,
      email: scopedEmail,
      password: PASSWORD,
      name: 'Scoped Admin',
    });

    const db = stack.app.get(TenantAwareDb);
    const authDb = stack.app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
    const memberId = randomUUID();
    await authDb.db.insert(schema.member).values({
      id: memberId,
      organizationId: tenantId,
      userId: scopedUser.userId,
      role: 'admin',
      createdAt: new Date(),
    });
    await db.withoutTenant('seed scoped admin brand scope to A', (tx) =>
      tx.insert(schema.memberBrandScope).values({ memberId, brandId: brandAId, tenantId }),
    );

    const baseCookie = await signInAsOperator(stack.app, scopedEmail, PASSWORD, tenantId);
    const setPinRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/me/set-active-brand',
      headers: { cookie: baseCookie, 'x-tenant-id': tenantId },
      payload: { brandId: brandAId },
    });
    expect(setPinRes.statusCode).toBe(200);
    scopedAdminCookiePinnedA = extractCookies(setPinRes.headers['set-cookie']) || baseCookie;
  }, 240_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  describe('static guard-presence assertion — payout controllers carry NO @BrandNeutral', () => {
    it('RefundsController source does not contain @BrandNeutral', () => {
      const src = readFileSync(
        resolve(process.cwd(), 'src/contexts/payments/interfaces/http/refunds.controller.ts'),
        'utf-8',
      );
      expect(src).not.toContain('@BrandNeutral');
    });

    it('StripeOnboardingController source does not contain @BrandNeutral', () => {
      const src = readFileSync(
        resolve(
          process.cwd(),
          'src/contexts/tenancy/interfaces/http/stripe-onboarding.controller.ts',
        ),
        'utf-8',
      );
      expect(src).not.toContain('@BrandNeutral');
    });

    it('BrandOnboardingController source does not contain @BrandNeutral on the brand-scoped class', () => {
      const src = readFileSync(
        resolve(
          process.cwd(),
          'src/contexts/tenancy/interfaces/http/brand-onboarding.controller.ts',
        ),
        'utf-8',
      );
      const brandOnboardingClassIdx = src.indexOf('export class BrandOnboardingController');
      const beforeBrandOnboarding = src.slice(0, brandOnboardingClassIdx);
      const lastBrandNeutralBeforeClass = beforeBrandOnboarding.lastIndexOf('@BrandNeutral');
      const brandOauthClassIdx = src.indexOf('export class BrandOAuthCallbackController');
      if (lastBrandNeutralBeforeClass !== -1) {
        expect(lastBrandNeutralBeforeClass).toBeLessThan(brandOauthClassIdx);
      }
    });
  });

  describe('non-owner scoped to A, pin=A, sending x-brand-slug=B is blocked (D-10 pin mismatch)', () => {
    it('GET brand-B onboarding status returns 404 (existence-hiding, not 200)', async () => {
      const res = await stack.app.inject({
        method: 'GET',
        url: `/v1/tenancy/brands/${brandBSlug}/onboarding/status`,
        headers: hdr(scopedAdminCookiePinnedA, brandBSlug),
      });
      expect(res.statusCode).toBe(404);
    });

    it('POST brand-B onboarding account-session returns 404 (existence-hiding, not 200)', async () => {
      const res = await stack.app.inject({
        method: 'POST',
        url: `/v1/tenancy/brands/${brandBSlug}/onboarding/account-session`,
        headers: hdr(scopedAdminCookiePinnedA, brandBSlug),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('non-owner scoped to A, pin=A, sending x-brand-slug=A can reach A payout flow (control)', () => {
    it('GET brand-A onboarding status reaches the route (not blocked by guard) — 200 or domain error', async () => {
      const res = await stack.app.inject({
        method: 'GET',
        url: `/v1/tenancy/brands/${brandASlug}/onboarding/status`,
        headers: hdr(scopedAdminCookiePinnedA, brandASlug),
      });
      expect([200, 404]).toContain(res.statusCode);
      if (res.statusCode === 404) {
        const body = res.json<{ code?: string; message?: string }>();
        expect(body.message ?? '').not.toContain('brand');
      }
    });
  });

  describe('owner can reach either brand payout/onboarding flow (owner free-switch)', () => {
    it('owner GET brand-A onboarding status is not blocked by the guard', async () => {
      const res = await stack.app.inject({
        method: 'GET',
        url: `/v1/tenancy/brands/${brandASlug}/onboarding/status`,
        headers: hdr(ownerCookie, brandASlug),
      });
      expect([200, 404]).toContain(res.statusCode);
    });

    it('owner GET brand-B onboarding status is not blocked by the guard', async () => {
      const res = await stack.app.inject({
        method: 'GET',
        url: `/v1/tenancy/brands/${brandBSlug}/onboarding/status`,
        headers: hdr(ownerCookie, brandBSlug),
      });
      expect([200, 404]).toContain(res.statusCode);
    });
  });

  describe('RefundsController: non-owner scoped to A, pin=A is blocked from brand-B refund path', () => {
    it('POST /v1/orders/:id/refund with x-brand-slug=B returns 404 (pin mismatch, D-10)', async () => {
      const fakeOrderId = randomUUID();
      const res = await stack.app.inject({
        method: 'POST',
        url: `/v1/orders/${fakeOrderId}/refund`,
        headers: {
          ...hdr(scopedAdminCookiePinnedA, brandBSlug),
          'content-type': 'application/json',
        },
        payload: { reason: 'requested_by_customer' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('owner POST /v1/orders/:id/refund with x-brand-slug=B is not blocked by guard (reaches domain)', async () => {
      const fakeOrderId = randomUUID();
      const res = await stack.app.inject({
        method: 'POST',
        url: `/v1/orders/${fakeOrderId}/refund`,
        headers: {
          ...hdr(ownerCookie, brandBSlug),
          'content-type': 'application/json',
        },
        payload: { reason: 'requested_by_customer' },
      });
      expect([400, 404, 422]).toContain(res.statusCode);
      if (res.statusCode === 404 && res.json<{ code?: string }>().code) {
        expect(res.json<{ code: string }>().code).not.toMatch(/^brand\./);
      }
    });
  });
});
