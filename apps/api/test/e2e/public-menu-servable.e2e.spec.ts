import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { schema, TenantAwareDb } from '@resto/db';
import { IMAGE_URL_PORT } from '../../src/contexts/catalog/domain/ports';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { runBootstrap, signInAsOperator } from './helpers/operator-fixture';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[public-menu-servable.e2e] Docker not available — skipping.');
}

const INTERNAL_TOKEN = 'integration-test-token-1234567890';
const PASSWORD = 'Sup3r-Secret-Pw!';

interface SeededTenant {
  id: string;
  brandHost: string;
}

const seedPublishedTenant = async (
  app: NestFastifyApplication,
  db: TenantAwareDb,
  label: string,
): Promise<SeededTenant> => {
  const tenantId = randomUUID();
  const brandId = randomUUID();
  const tenantSlug = `${label}-t-${randomUUID().slice(0, 8)}`;
  const brandSlug = `${label}-b-${randomUUID().slice(0, 8)}`;
  const tenantHost = `${tenantSlug}.menu.resto.app`;
  const brandHost = `${brandSlug}.menu.resto.app`;

  await db.withoutTenant('seed tenant for public-menu-servable e2e', async (tx) => {
    await tx.insert(schema.tenants).values({
      id: tenantId,
      slug: tenantSlug,
      displayName: `Servable ${label}`,
      locale: 'en',
      defaultCurrency: 'USD',
    });
    await tx.insert(schema.tenantDomains).values({
      tenantId,
      domain: tenantHost,
      kind: 'subdomain',
      isPrimary: true,
    });
    await tx.insert(schema.brands).values({
      id: brandId,
      tenantId,
      slug: brandSlug,
      displayName: `Brand ${label}`,
    });
    await tx.insert(schema.brandDomains).values({
      brandId,
      tenantId,
      domain: brandHost,
      kind: 'subdomain',
      isPrimary: true,
    });
  });

  const email = `owner-${randomUUID().slice(0, 8)}@example.com`;
  await runBootstrap({ tenantSlug, email, password: PASSWORD, name: `Owner ${label}` });
  const ownerCookie = await signInAsOperator(app, email, PASSWORD, tenantId);
  const authed = { cookie: ownerCookie, 'x-tenant-id': tenantId, 'x-brand-slug': brandSlug };

  const categoryRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/categories',
    headers: authed,
    payload: { slug: 'mains', name: { en: 'Mains' }, sortOrder: 0 },
  });
  expect(categoryRes.statusCode).toBe(200);
  const categoryId = categoryRes.json<{ id: string }>().id;

  const itemRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/items',
    headers: authed,
    payload: {
      categoryId,
      slug: 'classic',
      name: { en: 'Classic' },
      basePrice: '9.99',
      currency: 'USD',
      status: 'published',
    },
  });
  expect(itemRes.statusCode).toBe(200);

  const publishRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/publish',
    headers: authed,
  });
  expect(publishRes.statusCode).toBe(200);

  return { id: tenantId, brandHost };
};

suite('Public menu read — only an active tenant is served (AUDIT #21)', () => {
  let stack: RealStack;
  let db: TenantAwareDb;

  beforeAll(async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';

    stack = await startRealStack({
      natsEnabledInApp: false,
      overrideProviders: [
        {
          provide: IMAGE_URL_PORT,
          useValue: {
            presignGet: (key: string, ttl: number): Promise<string> =>
              Promise.resolve(`https://signed.test/${key}?expires=${ttl.toString()}`),
          },
        },
      ],
    });
    db = stack.app.get(TenantAwareDb);
  }, 240_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('serves GET /v1/menu while active, then 404 once suspended', async () => {
    const tenant = await seedPublishedTenant(stack.app, db, 'susp');

    const active = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: tenant.brandHost },
    });
    expect(active.statusCode).toBe(200);

    const suspend = await stack.app.inject({
      method: 'POST',
      url: `/internal/v1/tenants/${tenant.id}/suspend`,
      headers: { 'x-internal-token': INTERNAL_TOKEN, 'content-type': 'application/json' },
      payload: { requestedBy: 'audit-21' },
    });
    expect(suspend.statusCode).toBe(200);

    const suspended = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: tenant.brandHost },
    });
    expect(suspended.statusCode).toBe(404);

    // Billing/internal stays reachable on a suspended tenant so it can pay
    // to un-suspend — resume must succeed (not blocked) and re-serve.
    const resume = await stack.app.inject({
      method: 'POST',
      url: `/internal/v1/tenants/${tenant.id}/resume`,
      headers: { 'x-internal-token': INTERNAL_TOKEN },
    });
    expect(resume.statusCode).toBe(200);
    expect(resume.json<{ status: string }>().status).toBe('active');

    const reserved = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: tenant.brandHost },
    });
    expect(reserved.statusCode).toBe(200);
  }, 120_000);

  it('404s GET /v1/menu once archived, hiding existence', async () => {
    const tenant = await seedPublishedTenant(stack.app, db, 'arch');

    const active = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: tenant.brandHost },
    });
    expect(active.statusCode).toBe(200);

    const archive = await stack.app.inject({
      method: 'POST',
      url: `/internal/v1/tenants/${tenant.id}/archive`,
      headers: { 'x-internal-token': INTERNAL_TOKEN },
    });
    expect(archive.statusCode).toBe(204);

    const archived = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: tenant.brandHost },
    });
    expect(archived.statusCode).toBe(404);
    const body = archived.json<{ items?: unknown }>();
    expect(body.items).toBeUndefined();
  }, 120_000);
});
