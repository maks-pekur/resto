import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
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
  console.warn('[menu-response.e2e] Docker not available — skipping.');
}

const PASSWORD = 'Sup3r-Secret-Pw!';

// Replaces the deleted pre-merge response-shape spec (10.2 plan 19). The
// "returns id/slug/displayName/theme" and "404 on a tenant with no
// sub-label" cases are dropped, not ported: `PublishedMenu`
// (domain/published-menu.ts) carries no nested-entity field post-merge,
// and a tenant is always itself menu-servable — there is no dangling
// "tenant with no sub-label" state left to 404 on. Every ETag/
// Cache-Control/If-None-Match/no-Set-Cookie assertion survives unchanged,
// just on the tenant's own host directly (the guest menu host collapses
// from a two-label subdomain to `<tenantSlug>.menu.<domain>`, D-22/D-23).
// apps/CLAUDE.md names this file as the regression net for the
// no-Set-Cookie invariant — keep and extend it, per the plan's own
// instruction.
suite('GET /v1/menu — response shape and caching', () => {
  let stack: RealStack;
  let tenantId: string;
  let tenantSlug: string;
  let tenantHost: string;
  let authed: Record<string, string>;
  let itemId: string;

  const expectEtag = (value: string | string[] | undefined): string => {
    expect(typeof value).toBe('string');
    if (typeof value !== 'string') throw new Error('etag header missing');
    return value;
  };

  const getMenuEtag = async (): Promise<string> => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: tenantHost },
    });
    expect(res.statusCode).toBe(200);
    return expectEtag(res.headers.etag);
  };

  const waitForEtagChange = async (previous: string): Promise<string> => {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      const current = await getMenuEtag();
      if (current !== previous) return current;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`menu ETag did not change from ${previous} within the deadline`);
  };

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

    tenantId = randomUUID();
    tenantSlug = `res154-tenant-${randomUUID().slice(0, 8)}`;
    tenantHost = `${tenantSlug}.menu.resto.app`;
    const db = stack.app.get(TenantAwareDb);

    await db.withoutTenant('seed tenant for menu-response e2e', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: tenantId,
        slug: tenantSlug,
        displayName: 'RES-154 Tenant',
        locale: 'en',
        country: 'GB',
        defaultCurrency: 'USD',
      });
      await tx.insert(schema.tenantDomains).values({
        tenantId,
        domain: tenantHost,
        kind: 'subdomain',
        isPrimary: true,
      });
    });

    const email = `owner-${randomUUID().slice(0, 8)}@example.com`;
    await runBootstrap({ tenantSlug, email, password: PASSWORD, name: 'RES-154 Owner' });
    const ownerCookie = await signInAsOperator(stack.app, email, PASSWORD, tenantId);
    const preLocationAuthed = {
      cookie: ownerCookie,
      'x-tenant-id': tenantId,
    };

    const locationRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/tenancy/locations',
      headers: preLocationAuthed,
      payload: { name: 'RES-154 Location' },
    });
    if (locationRes.statusCode !== 200) {
      throw new Error(
        `location seed failed: ${locationRes.statusCode.toString()} ${locationRes.body}`,
      );
    }
    const locationId = locationRes.json<{ id: string }>().id;
    authed = { ...preLocationAuthed, 'x-location-id': locationId };

    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: authed,
      payload: { slug: 'mains', name: { en: 'Mains' }, sortOrder: 0 },
    });
    if (categoryRes.statusCode !== 200) {
      throw new Error(
        `category seed failed: ${categoryRes.statusCode.toString()} ${categoryRes.body}`,
      );
    }
    const categoryId = categoryRes.json<{ id: string }>().id;

    const itemRes = await stack.app.inject({
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
    if (itemRes.statusCode !== 200) {
      throw new Error(`item seed failed: ${itemRes.statusCode.toString()} ${itemRes.body}`);
    }
    itemId = itemRes.json<{ id: string }>().id;

    const publishRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/publish',
      headers: authed,
    });
    if (publishRes.statusCode !== 200) {
      throw new Error(`publish failed: ${publishRes.statusCode.toString()} ${publishRes.body}`);
    }
  }, 240_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('GET /v1/menu carries a menu-version ETag and the Cache-Control directive', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: tenantHost },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, s-maxage=300, stale-while-revalidate=60');
    expectEtag(res.headers.etag);
  }, 60_000);

  it('public menu reads carry no Set-Cookie so an edge cache can store them', async () => {
    for (const url of ['/v1/menu', '/v1/menu/availability']) {
      const res = await stack.app.inject({ method: 'GET', url, headers: { host: tenantHost } });
      expect(res.statusCode).toBe(200);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  }, 60_000);

  // D-24 companion: the guest menu host must never receive the operator
  // session cookie, even when the request happens to carry one (e.g. a
  // browser tab that also has an operator session cookie for a DIFFERENT,
  // same-registrable-domain host). AUTH_COOKIE_DOMAIN scopes the cookie to
  // `.admin.<domain>`, so it is never sent to `.menu.<domain>` by the
  // browser in the first place — this asserts the server side of that
  // contract: the guest response itself never sets or echoes one back.
  it('a request to the guest menu host never receives an operator session cookie', async () => {
    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: tenantHost, cookie: 'better-auth.session_token=forged-operator-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
  }, 60_000);

  it('honours If-None-Match: a current ETag yields an empty 304, a stale one yields 200', async () => {
    const before = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: tenantHost },
    });
    const currentEtag = expectEtag(before.headers.etag);

    const notModified = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: tenantHost, 'if-none-match': currentEtag },
    });
    expect(notModified.statusCode).toBe(304);
    expect(notModified.body).toBe('');

    const republish = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/publish',
      headers: authed,
    });
    expect(republish.statusCode).toBe(200);

    const newEtag = await waitForEtagChange(currentEtag);
    expect(newEtag).not.toBe(currentEtag);

    const stale = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: tenantHost, 'if-none-match': currentEtag },
    });
    expect(stale.statusCode).toBe(200);
    expect(expectEtag(stale.headers.etag)).toBe(newEtag);
    expect(stale.json<{ items: unknown[] }>().items.length).toBeGreaterThan(0);

    const fresh = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: tenantHost, 'if-none-match': newEtag },
    });
    expect(fresh.statusCode).toBe(304);
    expect(fresh.body).toBe('');
  }, 60_000);

  it('stopping an item does not change the /v1/menu ETag and keeps the item present', async () => {
    const before = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: tenantHost },
    });
    const etagBeforeStop = expectEtag(before.headers.etag);
    const itemsBefore = before.json<{ items: { id: string }[] }>().items;
    expect(itemsBefore.some((i) => i.id === itemId)).toBe(true);

    const stopRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/stop-list',
      headers: authed,
      payload: { itemId, reason: '86' },
    });
    expect(stopRes.statusCode).toBe(200);

    const after = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { host: tenantHost },
    });
    expect(after.statusCode).toBe(200);
    const etagAfterStop = expectEtag(after.headers.etag);
    expect(etagAfterStop).toBe(etagBeforeStop);

    const stoppedItem = after
      .json<{ items: { id: string }[] }>()
      .items.find((i) => i.id === itemId);
    expect(stoppedItem).toBeDefined();
    expect(stoppedItem).not.toHaveProperty('isStopListed');

    const detail = await stack.app.inject({
      method: 'GET',
      url: `/v1/menu/items/${itemId}`,
      headers: { host: tenantHost },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json<{ id: string }>().id).toBe(itemId);
  }, 60_000);
});
