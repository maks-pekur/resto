import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { schema, TenantAwareDb } from '@resto/db';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[brand-host-resolution.e2e] Docker not available — skipping.');
}

suite('brand-host resolution end-to-end', () => {
  let stack: RealStack;
  let tenantId: string;
  let brandId: string;

  beforeAll(async () => {
    stack = await startRealStack({ natsEnabledInApp: false });
    tenantId = randomUUID();
    brandId = randomUUID();

    const db = stack.app.get(TenantAwareDb);
    await db.withoutTenant('seed brand for resolver e2e', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: tenantId,
        slug: 'res151-tenant',
        displayName: 'RES-151 tenant',
        locale: 'en',
        defaultCurrency: 'USD',
      });
      await tx.insert(schema.tenantDomains).values({
        tenantId,
        domain: 'res151-tenant.menu.resto.app',
        kind: 'subdomain',
        isPrimary: true,
      });
      await tx.insert(schema.brands).values({
        id: brandId,
        tenantId,
        slug: 'res151-brand',
        displayName: 'RES-151 Brand',
      });
      await tx.insert(schema.brandDomains).values({
        brandId,
        tenantId,
        domain: 'order.res151.test',
        kind: 'custom',
        isPrimary: true,
      });
    });
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('GET /v1/menu with brand-slug subdomain resolves the right tenant', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: 'res151-brand.menu.resto.app' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ tenantId });
  });

  it('GET /v1/menu with custom brand domain resolves the right tenant', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: 'order.res151.test' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ tenantId });
  });

  it('GET /v1/menu with unknown brand-slug subdomain returns no tenant', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: 'no-such-brand.menu.resto.app' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /v1/menu with the legacy <tenant-slug>.menu host falls back to tenant resolution', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: 'res151-tenant.menu.resto.app' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ tenantId });
  });
});
