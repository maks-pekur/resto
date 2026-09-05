import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { schema } from '@resto/db';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import {
  addMemberWithRole,
  provisionTenant,
  runBootstrap,
  signIn,
  signInAsOperator,
} from './helpers/operator-fixture';
import { AUTH_DRIZZLE_TOKEN } from '../../src/contexts/identity/identity.tokens';
import type { AuthDrizzle } from '../../src/contexts/identity/infrastructure/better-auth/auth-db';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;
if (!dockerOk) {
  console.warn('[operator-tenant-binding] Docker not available — skipping integration tests.');
}

const INTERNAL_TOKEN = 'integration-test-token-1234567890';
const PUBLIC_APEX = 'opbind-e2e.example';

interface ProblemBody {
  readonly code?: string;
}

interface ItemsListBody {
  readonly items: readonly { readonly slug: string }[];
}

const seedPublishedItem = async (
  stack: RealStack,
  input: { cookie: string; tenantId: string; itemSlug: string },
): Promise<string> => {
  const headers = { cookie: input.cookie, 'x-tenant-id': input.tenantId };

  const categoryRes = await stack.app.inject({
    method: 'POST',
    url: '/v1/catalog/categories',
    headers,
    payload: {
      slug: `cat-${input.itemSlug}`,
      name: { en: `Category ${input.itemSlug}` },
      sortOrder: 0,
    },
  });
  expect(categoryRes.statusCode).toBe(200);
  const categoryId = categoryRes.json<{ id: string }>().id;

  const itemRes = await stack.app.inject({
    method: 'POST',
    url: '/v1/catalog/items',
    headers,
    payload: {
      categoryId,
      slug: input.itemSlug,
      name: { en: input.itemSlug },
      basePrice: '9.99',
      currency: 'USD',
      status: 'published',
    },
  });
  expect(itemRes.statusCode).toBe(200);
  const itemId = itemRes.json<{ id: string }>().id;

  const publishRes = await stack.app.inject({
    method: 'POST',
    url: '/v1/catalog/publish',
    headers,
  });
  expect(publishRes.statusCode).toBe(200);

  return itemId;
};

suite(
  'Operator session tenant binding survives a forged header, host, path or stale membership (07.4 D-02)',
  () => {
    let stack: RealStack;
    let authDb: AuthDrizzle;

    let tenantA: { id: string; slug: string };
    let tenantB: { id: string; slug: string };
    let cookieA: string;
    let cookieANoOrg: string;
    let cookieB: string;
    let slugAItem: string;
    let slugBItem: string;

    beforeAll(async () => {
      process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
      process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
      process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
      process.env.RATE_LIMIT_PUBLIC_PER_MIN = '10000';
      process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
      process.env.TRUST_PROXY = '0.0.0.0/0';
      process.env.PUBLIC_APEX_DOMAIN = PUBLIC_APEX;

      stack = await startRealStack();
      authDb = stack.app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);

      const slugA = `opbind-a-${randomUUID().slice(0, 8)}`;
      const slugB = `opbind-b-${randomUUID().slice(0, 8)}`;
      const emailA = `owner-${slugA}@example.com`;
      const passwordA = 'correct-horse-battery-staple-opbind-a';
      const emailB = `owner-${slugB}@example.com`;
      const passwordB = 'correct-horse-battery-staple-opbind-b';

      tenantA = await provisionTenant(stack.app, slugA, INTERNAL_TOKEN);
      tenantB = await provisionTenant(stack.app, slugB, INTERNAL_TOKEN);
      await runBootstrap({
        tenantSlug: slugA,
        email: emailA,
        password: passwordA,
        name: 'Owner A',
      });
      await runBootstrap({
        tenantSlug: slugB,
        email: emailB,
        password: passwordB,
        name: 'Owner B',
      });

      cookieA = await signInAsOperator(stack.app, emailA, passwordA, tenantA.id);
      cookieANoOrg = await signIn(stack.app, emailA, passwordA);
      cookieB = await signInAsOperator(stack.app, emailB, passwordB, tenantB.id);

      slugAItem = `item-a-${randomUUID().slice(0, 6)}`;
      slugBItem = `item-b-${randomUUID().slice(0, 6)}`;
      await seedPublishedItem(stack, {
        cookie: cookieA,
        tenantId: tenantA.id,
        itemSlug: slugAItem,
      });
      await seedPublishedItem(stack, {
        cookie: cookieB,
        tenantId: tenantB.id,
        itemSlug: slugBItem,
      });
    }, 180_000);

    afterAll(async () => {
      if (stack) await stopRealStack(stack);
    });

    it('A5: an operator reads its own tenant', async () => {
      const res = await stack.app.inject({
        method: 'GET',
        url: '/v1/catalog/items',
        headers: { cookie: cookieA, 'x-tenant-id': tenantA.id },
      });
      expect(res.statusCode).toBe(200);
      const slugs = res.json<ItemsListBody>().items.map((i) => i.slug);
      expect(slugs).toContain(slugAItem);
      expect(slugs).not.toContain(slugBItem);
    });

    it('A1: a forged x-tenant-id cannot cross tenants', async () => {
      const res = await stack.app.inject({
        method: 'GET',
        url: '/v1/catalog/items',
        headers: { cookie: cookieA, 'x-tenant-id': tenantB.id },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json<ProblemBody>().code).toBe('auth.tenant_mismatch');
    });

    it('A2: a session with no active organization cannot bind a tenant', async () => {
      const res = await stack.app.inject({
        method: 'GET',
        url: '/v1/catalog/items',
        headers: { cookie: cookieANoOrg, 'x-tenant-id': tenantB.id },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json<ProblemBody>().code).toBe('auth.tenant_mismatch');
    });

    it('A4: a session outliving its membership cannot keep reading', async () => {
      const email = `admin-${randomUUID().slice(0, 8)}@example.com`;
      const password = 'correct-horse-battery-staple-opbind-a4';
      const cookie = await addMemberWithRole(stack.app, {
        tenantId: tenantA.id,
        internalToken: INTERNAL_TOKEN,
        email,
        password,
        name: 'A4 Admin',
        role: 'admin',
      });

      const before = await stack.app.inject({
        method: 'GET',
        url: '/v1/catalog/items',
        headers: { cookie, 'x-tenant-id': tenantA.id },
      });
      expect(before.statusCode).toBe(200);

      await authDb.db
        .delete(schema.member)
        .where(and(eq(schema.member.tenantId, tenantA.id), eq(schema.member.role, 'admin')));

      const after = await stack.app.inject({
        method: 'GET',
        url: '/v1/catalog/items',
        headers: { cookie, 'x-tenant-id': tenantA.id },
      });
      expect(after.statusCode).toBe(403);
      expect(after.json<ProblemBody>().code).toBe('auth.tenant_membership_missing');
    }, 60_000);
  },
);
