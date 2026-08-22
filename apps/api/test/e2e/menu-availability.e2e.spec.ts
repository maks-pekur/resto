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
  console.warn('[menu-availability.e2e] Docker not available — skipping.');
}

const PASSWORD = 'Sup3r-Secret-Pw!';

const expectEtag = (value: string | string[] | undefined): string => {
  expect(typeof value).toBe('string');
  if (typeof value !== 'string') throw new Error('etag header missing');
  return value;
};

interface SeededTenant {
  tenantId: string;
  tenantHost: string;
  ownerCookie: string;
  authed: Record<string, string>;
  firstItemId: string;
  secondItemId: string;
}

suite('GET /v1/menu/availability — stop-version ETag', () => {
  let stack: RealStack;
  let tenantA: SeededTenant;
  let tenantB: SeededTenant;

  const seedTenant = async (params: {
    displayName: string;
  }): Promise<{ tenantId: string; tenantHost: string; ownerCookie: string }> => {
    const tenantId = randomUUID();
    const tenantSlug = `avail-tenant-${randomUUID().slice(0, 8)}`;
    const tenantHost = `${tenantSlug}.menu.resto.app`;
    const db = stack.app.get(TenantAwareDb);
    await db.withoutTenant('seed tenant for menu-availability e2e', async (tx) => {
      await tx.insert(schema.tenants).values({
        id: tenantId,
        slug: tenantSlug,
        displayName: params.displayName,
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
    await runBootstrap({
      tenantSlug,
      email,
      password: PASSWORD,
      name: `Owner ${params.displayName}`,
    });
    const ownerCookie = await signInAsOperator(stack.app, email, PASSWORD, tenantId);
    return { tenantId, tenantHost, ownerCookie };
  };

  const seedPublishedItems = async (params: {
    tenantId: string;
    ownerCookie: string;
  }): Promise<{ authed: Record<string, string>; firstItemId: string; secondItemId: string }> => {
    const preLocationAuthed = {
      cookie: params.ownerCookie,
      'x-tenant-id': params.tenantId,
    };
    const locationRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/tenancy/locations',
      headers: preLocationAuthed,
      payload: { name: 'Availability location' },
    });
    if (locationRes.statusCode !== 200) {
      throw new Error(
        `location seed failed: ${locationRes.statusCode.toString()} ${locationRes.body}`,
      );
    }
    const locationId = locationRes.json<{ id: string }>().id;
    const authed = { ...preLocationAuthed, 'x-location-id': locationId };

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

    const insertItem = async (slug: string): Promise<string> => {
      const res = await stack.app.inject({
        method: 'POST',
        url: '/v1/catalog/items',
        headers: authed,
        payload: {
          categoryId,
          slug,
          name: { en: slug },
          basePrice: '9.99',
          currency: 'USD',
          status: 'published',
        },
      });
      if (res.statusCode !== 200) {
        throw new Error(`item seed failed: ${res.statusCode.toString()} ${res.body}`);
      }
      return res.json<{ id: string }>().id;
    };

    const firstItemId = await insertItem('first');
    const secondItemId = await insertItem('second');

    const publishRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/publish',
      headers: authed,
    });
    if (publishRes.statusCode !== 200) {
      throw new Error(`publish failed: ${publishRes.statusCode.toString()} ${publishRes.body}`);
    }

    return { authed, firstItemId, secondItemId };
  };

  const stopItem = async (authed: Record<string, string>, itemId: string): Promise<void> => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/catalog/stop-list',
      headers: authed,
      payload: { itemId },
    });
    if (res.statusCode !== 200) {
      throw new Error(`stop failed: ${res.statusCode.toString()} ${res.body}`);
    }
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

    const a = await seedTenant({ displayName: 'Tenant A' });
    const aItems = await seedPublishedItems({ tenantId: a.tenantId, ownerCookie: a.ownerCookie });
    tenantA = { ...a, ...aItems };

    const b = await seedTenant({ displayName: 'Tenant B' });
    const bItems = await seedPublishedItems({ tenantId: b.tenantId, ownerCookie: b.ownerCookie });
    tenantB = { ...b, ...bItems };
  }, 240_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('returns stopped item ids with cache headers and an ETag', async () => {
    await stopItem(tenantA.authed, tenantA.firstItemId);

    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu/availability',
      headers: { host: tenantA.tenantHost },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ stoppedItemIds: string[] }>();
    expect(body.stoppedItemIds).toContain(tenantA.firstItemId);
    expect(res.headers['cache-control']).toBe('public, s-maxage=5');
    expect(typeof res.headers.etag).toBe('string');
  }, 60_000);

  it('bumps the ETag on a new stop and honours If-None-Match', async () => {
    const before = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu/availability',
      headers: { host: tenantA.tenantHost },
    });
    const previousEtag = expectEtag(before.headers.etag);

    const notModified = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu/availability',
      headers: { host: tenantA.tenantHost, 'if-none-match': previousEtag },
    });
    expect(notModified.statusCode).toBe(304);
    expect(notModified.body).toBe('');

    await stopItem(tenantA.authed, tenantA.secondItemId);

    const after = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu/availability',
      headers: { host: tenantA.tenantHost, 'if-none-match': previousEtag },
    });
    expect(after.statusCode).toBe(200);
    const currentEtag = expectEtag(after.headers.etag);
    expect(currentEtag).not.toBe(previousEtag);
    const afterBody = after.json<{ stoppedItemIds: string[] }>();
    expect(afterBody.stoppedItemIds).toContain(tenantA.firstItemId);
    expect(afterBody.stoppedItemIds).toContain(tenantA.secondItemId);

    const revalidated = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu/availability',
      headers: { host: tenantA.tenantHost, 'if-none-match': currentEtag },
    });
    expect(revalidated.statusCode).toBe(304);
    expect(revalidated.body).toBe('');
  }, 60_000);

  it('isolates stopped item ids per tenant', async () => {
    await stopItem(tenantB.authed, tenantB.firstItemId);

    const res = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu/availability',
      headers: { host: tenantA.tenantHost },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ stoppedItemIds: string[] }>();
    expect(body.stoppedItemIds).not.toContain(tenantB.firstItemId);
  }, 60_000);
});
