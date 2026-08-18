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

if (!dockerOk) {
  console.warn('[order-routes-authz.e2e] Docker not available — skipping.');
}

const createBrand = async (
  stack: RealStack,
  ownerCookie: string,
  tenantId: string,
  slug: string,
): Promise<string> => {
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
  const brand = rows[0];
  if (!brand) throw new Error(`brand ${slug} not found after create`);
  return brand.id;
};

suite('Order routes authorization + rate-limit e2e (Plan 10-08)', () => {
  describe('Cases 1-7 — location scope, cross-location denial, non-owner cancel, owner-only refund', () => {
    let stack: RealStack;
    let tenantId: string;
    let brandId: string;
    let brandSlug: string;
    let locationL1Id: string;
    let locationL2Id: string;
    let ownerCookie: string;
    let nonOwnerCookie: string;
    let shortNumberCounter = 1;

    let orderMutateWithoutLocationId: string;
    let orderOwnerConcreteLocationId: string;
    let otherTenantId: string;
    let otherTenantBrandSlug: string;
    let otherTenantLocationId: string;
    let otherTenantOwnerCookie: string;
    let crossTenantOrderId: string;

    const ownerHeaders = (extra: Record<string, string> = {}) => ({
      cookie: ownerCookie,
      'x-tenant-id': tenantId,
      'x-brand-slug': brandSlug,
      ...extra,
    });

    const nonOwnerHeaders = (extra: Record<string, string> = {}) => ({
      cookie: nonOwnerCookie,
      'x-tenant-id': tenantId,
      'x-brand-slug': brandSlug,
      ...extra,
    });

    const createLocation = async (name: string): Promise<string> => {
      const res = await stack.app.inject({
        method: 'POST',
        url: '/v1/tenancy/locations',
        headers: { cookie: ownerCookie, 'x-tenant-id': tenantId, 'x-brand-slug': brandSlug },
        payload: { name },
      });
      expect(res.statusCode).toBe(200);
      return res.json<{ id: string }>().id;
    };

    const seedOrder = async (locationId: string, status = 'paid'): Promise<string> => {
      const orderId = randomUUID();
      const db = stack.app.get(TenantAwareDb);
      await db.withoutTenant('seed order for authz e2e', async (tx) => {
        await tx.insert(schema.orders).values({
          id: orderId,
          tenantId,
          brandId,
          locationId,
          idempotencyKey: randomUUID(),
          orderNumber: `ORD-AUTHZ-${orderId.slice(0, 8)}`,
          status,
          fulfillmentMode: 'dine_in',
          subtotal: '10.00',
          total: '10.00',
          currency: 'EUR',
          shortNumber: shortNumberCounter++,
        });
      });
      return orderId;
    };

    const readOrderStatus = async (orderId: string): Promise<string | undefined> => {
      const db = stack.app.get(TenantAwareDb);
      const rows = await db.withoutTenant('read order status for authz e2e', (tx) =>
        tx
          .select({ status: schema.orders.status })
          .from(schema.orders)
          .where(eq(schema.orders.id, orderId)),
      );
      return rows[0]?.status;
    };

    const countPaymentRefundsForOrder = async (orderId: string): Promise<number> => {
      const db = stack.app.get(TenantAwareDb);
      const rows = await db.withoutTenant('count payment_refunds for authz e2e', (tx) =>
        tx
          .select({ id: schema.paymentRefunds.id })
          .from(schema.paymentRefunds)
          .innerJoin(schema.payments, eq(schema.paymentRefunds.paymentId, schema.payments.id))
          .where(eq(schema.payments.orderId, orderId)),
      );
      return rows.length;
    };

    beforeAll(async () => {
      process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
      process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
      process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
      process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
      stack = await startRealStack({ natsEnabledInApp: false });

      const tenantSlug = `authz-${randomUUID().slice(0, 8)}`;
      const ownerEmail = `owner-${randomUUID().slice(0, 8)}@example.com`;
      const tenant = await provisionTenant(stack.app, tenantSlug, INTERNAL_TOKEN);
      tenantId = tenant.id;
      await runBootstrap({ tenantSlug, email: ownerEmail, password: PASSWORD, name: 'Owner' });
      ownerCookie = await signInAsOperator(stack.app, ownerEmail, PASSWORD, tenantId);

      brandSlug = `authz-brand-${randomUUID().slice(0, 8)}`;
      brandId = await createBrand(stack, ownerCookie, tenantId, brandSlug);

      locationL1Id = await createLocation('Location 1');
      locationL2Id = await createLocation('Location 2');

      const nonOwnerEmail = `staff-${randomUUID().slice(0, 8)}@example.com`;
      const throwawaySlug = `authz-member-${randomUUID().slice(0, 8)}`;
      await provisionTenant(stack.app, throwawaySlug, INTERNAL_TOKEN);
      const nonOwnerUser = await runBootstrap({
        tenantSlug: throwawaySlug,
        email: nonOwnerEmail,
        password: PASSWORD,
        name: 'Non-owner',
      });
      const authDb = stack.app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
      const memberId = randomUUID();
      await authDb.db.insert(schema.member).values({
        id: memberId,
        organizationId: tenantId,
        userId: nonOwnerUser.userId,
        role: 'admin',
        createdAt: new Date(),
      });
      const db = stack.app.get(TenantAwareDb);
      await db.withoutTenant('seed member location scope for authz e2e', (tx) =>
        tx.insert(schema.memberLocationScope).values({
          memberId,
          locationId: locationL1Id,
          tenantId,
        }),
      );
      nonOwnerCookie = await signInAsOperator(stack.app, nonOwnerEmail, PASSWORD, tenantId);

      orderMutateWithoutLocationId = await seedOrder(locationL1Id);
      orderOwnerConcreteLocationId = await seedOrder(locationL2Id);

      const otherTenantSlug = `authz-other-${randomUUID().slice(0, 8)}`;
      const otherOwnerEmail = `owner-other-${randomUUID().slice(0, 8)}@example.com`;
      const otherTenant = await provisionTenant(stack.app, otherTenantSlug, INTERNAL_TOKEN);
      otherTenantId = otherTenant.id;
      await runBootstrap({
        tenantSlug: otherTenantSlug,
        email: otherOwnerEmail,
        password: PASSWORD,
        name: 'Other Owner',
      });
      otherTenantOwnerCookie = await signInAsOperator(
        stack.app,
        otherOwnerEmail,
        PASSWORD,
        otherTenantId,
      );
      otherTenantBrandSlug = `authz-other-brand-${randomUUID().slice(0, 8)}`;
      await createBrand(stack, otherTenantOwnerCookie, otherTenantId, otherTenantBrandSlug);
      const otherLocRes = await stack.app.inject({
        method: 'POST',
        url: '/v1/tenancy/locations',
        headers: {
          cookie: otherTenantOwnerCookie,
          'x-tenant-id': otherTenantId,
          'x-brand-slug': otherTenantBrandSlug,
        },
        payload: { name: 'Other Tenant Location' },
      });
      expect(otherLocRes.statusCode).toBe(200);
      otherTenantLocationId = otherLocRes.json<{ id: string }>().id;

      crossTenantOrderId = await seedOrder(locationL1Id);
    }, 240_000);

    afterAll(async () => {
      if (stack) await stopRealStack(stack);
    });

    it('case 1 — the feed requires an explicit location; owner reads exactly that location', async () => {
      const noLocation = await stack.app.inject({
        method: 'GET',
        url: '/v1/orders/feed',
        headers: ownerHeaders(),
      });
      expect(noLocation.statusCode).toBe(403);
      expect(noLocation.json<{ code?: string }>().code).toBe('location.context_required');

      const l1 = await stack.app.inject({
        method: 'GET',
        url: '/v1/orders/feed',
        headers: ownerHeaders({ 'x-location-id': locationL1Id }),
      });
      expect(l1.statusCode).toBe(200);
      const rows = l1.json<{ rows: { id: string; locationId: string }[] }>().rows;
      expect(rows.map((r) => r.id)).toContain(orderMutateWithoutLocationId);
      expect(rows.map((r) => r.id)).not.toContain(orderOwnerConcreteLocationId);
      expect(new Set(rows.map((r) => r.locationId))).toEqual(new Set([locationL1Id]));
    });

    it('case 1b — non-owner scoped to L1 cannot read the L2 feed, and gets no cross-location rows', async () => {
      const forged = await stack.app.inject({
        method: 'GET',
        url: '/v1/orders/feed',
        headers: nonOwnerHeaders({ 'x-location-id': locationL2Id }),
      });
      expect([403, 404]).toContain(forged.statusCode);

      const unscoped = await stack.app.inject({
        method: 'GET',
        url: '/v1/orders/feed',
        headers: nonOwnerHeaders(),
      });
      expect([403, 404]).toContain(unscoped.statusCode);

      const own = await stack.app.inject({
        method: 'GET',
        url: '/v1/orders/feed',
        headers: nonOwnerHeaders({ 'x-location-id': locationL1Id }),
      });
      expect(own.statusCode).toBe(200);
      const rows = own.json<{ rows: { id: string; locationId: string }[] }>().rows;
      expect(new Set(rows.map((r) => r.locationId))).toEqual(new Set([locationL1Id]));
    });

    it('case 2 — owner mutates with a concrete location (accepts the L2 order)', async () => {
      const res = await stack.app.inject({
        method: 'POST',
        url: `/v1/orders/${orderOwnerConcreteLocationId}/accept`,
        headers: ownerHeaders({ 'x-location-id': locationL2Id }),
        payload: { prepMinutes: 20 },
      });
      expect(res.statusCode).toBe(200);
      expect(await readOrderStatus(orderOwnerConcreteLocationId)).toBe('accepted');
    });

    it('case 3 — owner mutates with no location header gets 403 location.context_required, row unchanged', async () => {
      const res = await stack.app.inject({
        method: 'POST',
        url: `/v1/orders/${orderMutateWithoutLocationId}/accept`,
        headers: ownerHeaders(),
        payload: { prepMinutes: 20 },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json<{ code?: string }>().code).toBe('location.context_required');
      expect(await readOrderStatus(orderMutateWithoutLocationId)).toBe('paid');
    });

    it('case 4 — non-owner scoped to L1 forging x-location-id L2 to accept the L2 order is denied, row unchanged', async () => {
      const res = await stack.app.inject({
        method: 'POST',
        url: `/v1/orders/${orderOwnerConcreteLocationId}/accept`,
        headers: nonOwnerHeaders({ 'x-location-id': locationL2Id }),
        payload: { prepMinutes: 20 },
      });
      expect([403, 404]).toContain(res.statusCode);
      expect(await readOrderStatus(orderOwnerConcreteLocationId)).toBe('accepted');
    });

    it('case 5 — non-owner cancels the L1 order (D-06: a cashier can refuse an order)', async () => {
      const res = await stack.app.inject({
        method: 'POST',
        url: `/v1/orders/${orderMutateWithoutLocationId}/cancel`,
        headers: nonOwnerHeaders({ 'x-location-id': locationL1Id }),
        payload: { reasonCode: 'guest_requested' },
      });
      expect(res.statusCode).toBe(200);
      expect(await readOrderStatus(orderMutateWithoutLocationId)).toBe('canceled');
    });

    it('case 6 — non-owner calling the arbitrary-amount refund route is denied, no payment_refunds row created', async () => {
      const before = await countPaymentRefundsForOrder(orderOwnerConcreteLocationId);
      const res = await stack.app.inject({
        method: 'POST',
        url: `/v1/orders/${orderOwnerConcreteLocationId}/refund`,
        headers: nonOwnerHeaders({ 'x-location-id': locationL2Id }),
        payload: { reason: 'goodwill' },
      });
      expect(res.statusCode).toBe(403);
      expect(await countPaymentRefundsForOrder(orderOwnerConcreteLocationId)).toBe(before);
    });

    it('case 7 — cross-tenant: tenant B requests tenant A order detail and attempts an advance, existence-hiding 404', async () => {
      const detailRes = await stack.app.inject({
        method: 'GET',
        url: `/v1/orders/${crossTenantOrderId}/detail`,
        headers: {
          cookie: otherTenantOwnerCookie,
          'x-tenant-id': otherTenantId,
          'x-brand-slug': otherTenantBrandSlug,
          'x-location-id': otherTenantLocationId,
        },
      });
      expect(detailRes.statusCode).toBe(404);

      const advanceRes = await stack.app.inject({
        method: 'POST',
        url: `/v1/orders/${crossTenantOrderId}/advance`,
        headers: {
          cookie: otherTenantOwnerCookie,
          'x-tenant-id': otherTenantId,
          'x-brand-slug': otherTenantBrandSlug,
          'x-location-id': otherTenantLocationId,
        },
        payload: { targetStatus: 'preparing' },
      });
      expect(advanceRes.statusCode).toBe(404);

      expect(await readOrderStatus(crossTenantOrderId)).toBe('paid');
    });
  });

  describe('Cases 8-9 — per-principal poll rate limiting, guest checkout survival', () => {
    let stack: RealStack;
    let tenantAId: string;
    let brandASlug: string;
    let ownerACookie: string;
    let tenantBId: string;
    let brandBSlug: string;
    let ownerBCookie: string;
    const SHARED_IP = '203.0.113.77';
    const CAP = 8;
    let locationAId: string;

    const firstLocationId = async (
      cookie: string,
      tenantId: string,
      brandSlug: string,
    ): Promise<string> => {
      const headers = { cookie, 'x-tenant-id': tenantId, 'x-brand-slug': brandSlug };
      const listed = await stack.app.inject({
        method: 'GET',
        url: '/v1/tenancy/locations',
        headers,
      });
      const existing = listed.statusCode === 200 ? listed.json<{ id: string }[]>() : [];
      const first = existing[0]?.id;
      if (first) return first;

      const created = await stack.app.inject({
        method: 'POST',
        url: '/v1/tenancy/locations',
        headers,
        payload: { name: 'Rate limit location' },
      });
      expect(created.statusCode).toBe(200);
      return created.json<{ id: string }>().id;
    };

    beforeAll(async () => {
      process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
      process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
      process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
      process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
      process.env.RATE_LIMIT_PUBLIC_PER_MIN = String(CAP);
      stack = await startRealStack({ natsEnabledInApp: false });

      const tenantASlug = `authz-rl-a-${randomUUID().slice(0, 8)}`;
      const ownerAEmail = `owner-rl-a-${randomUUID().slice(0, 8)}@example.com`;
      const tenantA = await provisionTenant(stack.app, tenantASlug, INTERNAL_TOKEN);
      tenantAId = tenantA.id;
      await runBootstrap({
        tenantSlug: tenantASlug,
        email: ownerAEmail,
        password: PASSWORD,
        name: 'Owner A',
      });
      ownerACookie = await signInAsOperator(stack.app, ownerAEmail, PASSWORD, tenantAId, SHARED_IP);
      brandASlug = `authz-rl-brand-a-${randomUUID().slice(0, 8)}`;
      await createBrand(stack, ownerACookie, tenantAId, brandASlug);

      const tenantBSlug = `authz-rl-b-${randomUUID().slice(0, 8)}`;
      const ownerBEmail = `owner-rl-b-${randomUUID().slice(0, 8)}@example.com`;
      const tenantB = await provisionTenant(stack.app, tenantBSlug, INTERNAL_TOKEN);
      tenantBId = tenantB.id;
      await runBootstrap({
        tenantSlug: tenantBSlug,
        email: ownerBEmail,
        password: PASSWORD,
        name: 'Owner B',
      });
      ownerBCookie = await signInAsOperator(stack.app, ownerBEmail, PASSWORD, tenantBId, SHARED_IP);
      locationAId = await firstLocationId(ownerACookie, tenantAId, brandASlug);
      brandBSlug = `authz-rl-brand-b-${randomUUID().slice(0, 8)}`;
      await createBrand(stack, ownerBCookie, tenantBId, brandBSlug);
    }, 240_000);

    afterAll(async () => {
      if (stack) await stopRealStack(stack);
    });

    it('case 8 — over-cap polling 429s the exhausted principal; a second principal on the same IP is unaffected', async () => {
      let sawLimited = false;
      for (let i = 0; i < CAP + 5; i += 1) {
        const res = await stack.app.inject({
          method: 'GET',
          url: '/v1/orders/feed',
          headers: {
            cookie: ownerACookie,
            'x-tenant-id': tenantAId,
            'x-brand-slug': brandASlug,
            'x-location-id': locationAId,
          },
          remoteAddress: SHARED_IP,
        });
        if (res.statusCode === 429) {
          expect(res.json<{ code?: string }>().code).toBe('rate-limit-exceeded');
          sawLimited = true;
          break;
        }
      }
      expect(sawLimited).toBe(true);

      const otherPrincipalRes = await stack.app.inject({
        method: 'GET',
        url: '/v1/orders/feed',
        headers: {
          cookie: ownerBCookie,
          'x-tenant-id': tenantBId,
          'x-brand-slug': brandBSlug,
          'x-location-id': await firstLocationId(ownerBCookie, tenantBId, brandBSlug),
        },
        remoteAddress: SHARED_IP,
      });
      expect(otherPrincipalRes.statusCode).toBe(200);
    });

    it('case 9 — guest checkout from the same IP still succeeds (not 429) after the polling burst', async () => {
      const res = await stack.app.inject({
        method: 'POST',
        url: '/v1/orders',
        headers: {
          'x-tenant-id': tenantAId,
          'x-brand-slug': brandASlug,
          'content-type': 'application/json',
        },
        remoteAddress: SHARED_IP,
        payload: {
          brandId: tenantAId,
          items: [],
          customerName: 'Guest',
          customerPhone: '+1234567890',
        },
      });
      expect(res.statusCode).not.toBe(429);
    });
  });
});
