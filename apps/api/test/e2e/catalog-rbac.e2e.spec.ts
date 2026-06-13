import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '@resto/db';
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
const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[catalog-rbac.e2e] Docker not available — skipping.');
}

suite('Catalog RBAC — menu mutations require menu permission (AUDIT #1)', () => {
  let stack: RealStack;
  let ownerCookie: string;
  let staffCookie: string;
  let tenantId: string;
  let categoryId: string;

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    stack = await startRealStack();

    const slug = `cafe-${randomUUID().slice(0, 8)}`;
    const staffSlug = `staff-tenant-${randomUUID().slice(0, 8)}`;
    const ownerEmail = `owner-${randomUUID().slice(0, 8)}@example.com`;
    const staffEmail = `staff-${randomUUID().slice(0, 8)}@example.com`;
    const password = 'Sup3r-Secret-Pw!';

    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    tenantId = tenant.id;

    await runBootstrap({ tenantSlug: slug, email: ownerEmail, password, name: 'Owner' });
    ownerCookie = await signInAsOperator(stack.app, ownerEmail, password, tenant.id);

    await provisionTenant(stack.app, staffSlug, INTERNAL_TOKEN);
    const staffUser = await runBootstrap({
      tenantSlug: staffSlug,
      email: staffEmail,
      password,
      name: 'Staff',
    });

    const authDb = stack.app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
    await authDb.db.insert(schema.member).values({
      id: randomUUID(),
      organizationId: tenant.id,
      userId: staffUser.userId,
      role: 'staff',
      createdAt: new Date(),
    });
    staffCookie = await signInAsOperator(stack.app, staffEmail, password, tenant.id);

    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: { 'x-internal-token': INTERNAL_TOKEN, 'x-tenant-slug': slug },
      payload: { slug: 'drinks', name: { en: 'Drinks' }, sortOrder: 0 },
    });
    expect(categoryRes.statusCode).toBe(200);
    categoryId = categoryRes.json<{ id: string }>().id;
  }, 180_000);

  afterAll(async () => {
    if (stack) await stopRealStack(stack);
  });

  const itemPayload = (): Record<string, unknown> => ({
    categoryId,
    slug: `cola-${randomUUID().slice(0, 8)}`,
    name: { en: 'Cola' },
    basePrice: '2.50',
    currency: 'USD',
    status: 'draft',
  });

  it('rejects an unauthenticated mutation with 401', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: { 'x-tenant-id': tenantId },
      payload: itemPayload(),
    });
    expect(res.statusCode).toBe(401);
  });

  it('forbids a staff operator from creating a menu item (403)', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: { cookie: staffCookie, 'x-tenant-id': tenantId },
      payload: itemPayload(),
    });
    expect(res.statusCode).toBe(403);
  });

  it('forbids a staff operator from publishing the menu (403)', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/publish',
      headers: { cookie: staffCookie, 'x-tenant-id': tenantId },
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows an owner to create a menu item (2xx)', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/items',
      headers: { cookie: ownerCookie, 'x-tenant-id': tenantId },
      payload: itemPayload(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ id: string }>().id).toBeTruthy();
  });
});
