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
  console.warn('[host-resolution.e2e] Docker not available — skipping.');
}

// Replaces the deleted pre-merge two-entity host-resolution spec (10.2 plan
// 19). Host resolution collapses from two entities (tenant, per-restaurant
// label) to one — the `.menu.` label now matches a tenant slug directly
// (tenant-resolver.service.ts:resolveByCustomerHost) — and this file
// becomes the natural home for D-22's explicit branches.
//
// 07.5-13: the separate guest apex is deleted — PUBLIC_APEX_DOMAIN is the only apex, so the
// `<slug>.<apex>` shape that used to be "reserved for the public site" now resolves the guest
// menu directly (branch 2 below), collapsing what used to be three branches into two live ones
// plus the unknown-host negative case.
suite('D-22 guest-menu host resolution', () => {
  let stack: RealStack;
  let tenantId: string;
  let tenantSlug: string;

  beforeAll(async () => {
    process.env.PUBLIC_APEX_DOMAIN = 'resto.app';
    stack = await startRealStack({ natsEnabledInApp: false });
    tenantId = randomUUID();
    tenantSlug = 'res151-tenant';

    const db = stack.app.get(TenantAwareDb);
    await db.withoutTenant('seed tenant for resolver e2e', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: tenantId,
        slug: tenantSlug,
        displayName: 'RES-151 tenant',
        locale: 'en',
        country: 'GB',
        defaultCurrency: 'USD',
      });
      await tx.insert(schema.tenantDomains).values([
        {
          tenantId,
          domain: `${tenantSlug}.menu.resto.app`,
          kind: 'subdomain',
          isPrimary: true,
        },
        {
          tenantId,
          domain: 'order.res151.test',
          kind: 'custom',
          isPrimary: false,
        },
      ]);
    });
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('branch 1: an exact tenant_domains row resolves the guest menu regardless of shape', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: `${tenantSlug}.menu.resto.app` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ tenantId });
  });

  it('a registered custom domain resolves the guest menu (D-23: one domain table)', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: 'order.res151.test' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ tenantId });
  });

  it('branch 2: <slug>.<PUBLIC_APEX_DOMAIN> resolves the guest menu by slug — the single-apex shape (07.5-13)', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: `${tenantSlug}.resto.app` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ tenantId });
  });

  it('branch 3: an unknown host resolves nothing', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: 'no-such-tenant.menu.resto.app' },
    });
    expect(res.statusCode).toBe(404);
  });
});
