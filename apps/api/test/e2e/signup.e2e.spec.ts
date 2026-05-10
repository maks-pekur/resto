import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
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
  console.warn('[signup.e2e] Docker not available — skipping integration tests.');
}

const buildSignupBody = (overrides: Partial<Record<string, unknown>> = {}) => ({
  email: `owner-${randomUUID().slice(0, 8)}@example.com`,
  password: 'a-strong-password-12',
  displayName: `Cafe Test ${randomUUID().slice(0, 6)}`,
  defaultCurrency: 'USD',
  locale: 'en',
  ...overrides,
});

interface SignUpResponse {
  tenant: { id: string; slug: string };
  brand: { id: string; slug: string };
  userId: string;
}

suite('Identity — public signup', () => {
  let stack: RealStack;
  let db: TenantAwareDb;

  beforeAll(async () => {
    stack = await startRealStack();
    db = stack.app.get(TenantAwareDb);
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('creates tenant + user + owner-member and returns Set-Cookie', async () => {
    const body = buildSignupBody({ displayName: `Roma ${randomUUID().slice(0, 6)}` });
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
    const json = res.json<SignUpResponse>();
    expect(json.tenant.id).toBeDefined();
    expect(json.userId).toBeDefined();
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(JSON.stringify(setCookie)).toContain('better-auth.session_token');

    const tenants = await db.withoutTenant('inspect signup tenant', (tx) =>
      tx.select().from(schema.tenants).where(eq(schema.tenants.id, json.tenant.id)),
    );
    expect(tenants).toHaveLength(1);

    const members = await db.withoutTenant('inspect signup member', (tx) =>
      tx.select().from(schema.member).where(eq(schema.member.organizationId, json.tenant.id)),
    );
    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe('owner');
    expect(members[0]?.userId).toBe(json.userId);

    expect(json.brand.id).toBeDefined();
    expect(json.brand.slug).toBe(json.tenant.slug);

    const brands = await db.withoutTenant('inspect signup brand', (tx) =>
      tx.select().from(schema.brands).where(eq(schema.brands.id, json.brand.id)),
    );
    expect(brands).toHaveLength(1);
    expect(brands[0]?.tenantId).toBe(json.tenant.id);
    expect(brands[0]?.slug).toBe(json.tenant.slug);
    expect(brands[0]?.status).toBe('active');

    const brandDomains = await db.withoutTenant('inspect signup brand_domains', (tx) =>
      tx.select().from(schema.brandDomains).where(eq(schema.brandDomains.brandId, json.brand.id)),
    );
    expect(brandDomains).toHaveLength(1);
    expect(brandDomains[0]?.kind).toBe('subdomain');
    expect(brandDomains[0]?.isPrimary).toBe(true);
    expect(brandDomains[0]?.domain).toBe(`${json.tenant.slug}.menu.resto.app`);
  }, 60_000);

  it('rejects duplicate email with 409', async () => {
    const body = buildSignupBody();
    const first = await stack.app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: body,
    });
    expect(first.statusCode).toBe(201);

    const dup = await stack.app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: { ...body, displayName: `Different ${randomUUID().slice(0, 6)}` },
    });
    expect(dup.statusCode).toBe(409);
  }, 60_000);

  it('auto-bumps slug suffix on displayName collision', async () => {
    const sameName = `Collision ${randomUUID().slice(0, 6)}`;

    const a = await stack.app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: buildSignupBody({ displayName: sameName }),
    });
    expect(a.statusCode).toBe(201);
    const slugA = a.json<SignUpResponse>().tenant.slug;

    const b = await stack.app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: buildSignupBody({ displayName: sameName }),
    });
    expect(b.statusCode).toBe(201);
    const slugB = b.json<SignUpResponse>().tenant.slug;

    expect(slugA).not.toEqual(slugB);
    expect(slugB).toMatch(new RegExp(`^${slugA}-2$`));
  }, 60_000);

  it('returns 400 on missing fields', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'bad', password: 'x', displayName: 'X' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('signed-up session can read /v1/me with active tenant', async () => {
    const body = buildSignupBody({ displayName: `Active ${randomUUID().slice(0, 6)}` });
    const signupRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: body,
    });
    expect(signupRes.statusCode).toBe(201);
    const json = signupRes.json<SignUpResponse>();

    const setCookies = signupRes.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookies)
      ? setCookies.map((c) => c.split(';')[0]).join('; ')
      : (setCookies?.split(';')[0] ?? '');

    const meRes = await stack.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { cookie: cookieHeader },
    });
    expect(meRes.statusCode).toBe(200);
    const me = meRes.json<{
      kind: string;
      tenantId?: string;
      userId?: string;
      baseRole?: string;
    }>();
    expect(me.kind).toBe('operator');
    expect(me.tenantId).toBe(json.tenant.id);
    expect(me.userId).toBe(json.userId);
    expect(me.baseRole).toBe('owner');
  }, 60_000);
});
