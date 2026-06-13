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
  status: 'pending_verification';
}

/**
 * D-06 (Phase 03) contract change: `POST /v1/signup` now returns the
 * enumeration-safe `{ status: 'pending_verification' }` body in BOTH the
 * new-email and email-taken branches. Set-Cookie is intentionally absent —
 * the new user follows the verification email + explicit sign-in path. The
 * dedicated enumeration parity spec is `signup-enumeration.e2e.spec.ts`;
 * this spec asserts the underlying side effects (tenant + member rows)
 * via direct DB inspection.
 */
suite('Identity — public signup (D-06 enumeration-safe contract)', () => {
  let stack: RealStack;
  let db: TenantAwareDb;

  beforeAll(async () => {
    stack = await startRealStack();
    db = stack.app.get(TenantAwareDb);
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('creates tenant + owner-member on new-email signup; no Set-Cookie', async () => {
    const displayName = `Roma ${randomUUID().slice(0, 6)}`;
    const body = buildSignupBody({ displayName });
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
    const json = res.json<SignUpResponse>();
    expect(json).toEqual({ status: 'pending_verification' });

    // D-06: NO Set-Cookie on the wire (would leak which branch ran).
    const setCookie = res.headers['set-cookie'];
    expect(setCookie === undefined || (Array.isArray(setCookie) && setCookie.length === 0)).toBe(
      true,
    );

    // Side effect IS observable to the operator team via DB — assert it
    // happened by looking up by displayName (the public body doesn't
    // surface the tenant id under D-06).
    const tenants = await db.withoutTenant('inspect signup tenant', (tx) =>
      tx.select().from(schema.tenants).where(eq(schema.tenants.displayName, displayName)),
    );
    expect(tenants).toHaveLength(1);
    const tenantId = tenants[0]?.id;
    if (typeof tenantId !== 'string') throw new Error('expected tenant id to be defined');

    const members = await db.withoutTenant('inspect signup member', (tx) =>
      tx.select().from(schema.member).where(eq(schema.member.organizationId, tenantId)),
    );
    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe('owner');
  }, 60_000);

  it('returns identical 201 body on duplicate email — no leak', async () => {
    const body = buildSignupBody();
    const first = await stack.app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: body,
    });
    expect(first.statusCode).toBe(201);
    expect(first.json<SignUpResponse>()).toEqual({ status: 'pending_verification' });

    // D-06: duplicate-email branch returns the SAME 201 + body shape.
    const dup = await stack.app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: { ...body, displayName: `Different ${randomUUID().slice(0, 6)}` },
    });
    expect(dup.statusCode).toBe(201);
    expect(dup.json<SignUpResponse>()).toEqual({ status: 'pending_verification' });

    // No Set-Cookie on either branch.
    const dupCookie = dup.headers['set-cookie'];
    expect(dupCookie === undefined || (Array.isArray(dupCookie) && dupCookie.length === 0)).toBe(
      true,
    );
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

    const b = await stack.app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: buildSignupBody({ displayName: sameName }),
    });
    expect(b.statusCode).toBe(201);

    // Both attempts return the same enumeration-safe body shape; slug
    // bump is observable in the DB only.
    const tenants = await db.withoutTenant('inspect collision tenants', (tx) =>
      tx.select().from(schema.tenants).where(eq(schema.tenants.displayName, sameName)),
    );
    expect(tenants).toHaveLength(2);
    const slugs = new Set(tenants.map((t) => t.slug));
    expect(slugs.size).toBe(2);
    // The second-inserted slug carries the `-2` suffix per `findFreeSlug`.
    const hasSuffix = [...slugs].some((s) => s.endsWith('-2'));
    expect(hasSuffix).toBe(true);
  }, 60_000);

  it('returns 400 on missing fields (validation never reaches enumeration wrap)', async () => {
    const res = await stack.app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'bad', password: 'x', displayName: 'X' },
    });
    expect(res.statusCode).toBe(400);
  });
});
