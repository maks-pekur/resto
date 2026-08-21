import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Test, type TestingModule } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { schema } from '@resto/db';
import { AppModule } from '../../src/app.module';
import { AUTH_DRIZZLE_TOKEN } from '../../src/contexts/identity/identity.tokens';
import type { AuthDrizzle } from '../../src/contexts/identity/infrastructure/better-auth/auth-db';

const INTERNAL_TOKEN = 'signup-e2e-internal-token-123';

const buildSignupBody = (overrides: Partial<Record<string, unknown>> = {}) => ({
  email: `owner-${randomUUID().slice(0, 8)}@example.com`,
  password: 'a-strong-password-12',
  name: `Cafe Owner ${randomUUID().slice(0, 6)}`,
  country: 'GB',
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
 *
 * D-25/D-27 (10.2 plan 13): the public body never surfaces the tenant id,
 * and the tenant's `displayName`/`slug` are now PROVISIONAL — derived from
 * `input.name` plus a random suffix, not equal to it — so side effects are
 * located via the BA `user` row (by email) -> `member` -> `tenants`, not by
 * matching `displayName` to the submitted value.
 *
 * No testcontainer here (10.2 plan 13, same rationale as
 * signup-enumeration.e2e.spec.ts) — a fresh-container migration replay
 * fails on the pre-existing 0079 idempotency bug (deferred-items.md,
 * owned by plans 05/19). The live dev Postgres is already migrated.
 */
describe('Identity — public signup (D-06 enumeration-safe contract)', () => {
  let app: NestFastifyApplication;
  let authDb: AuthDrizzle;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'postgres://resto_app:resto_app_dev_password@localhost:5433/resto';
    process.env.BETTER_AUTH_DATABASE_URL =
      'postgres://resto_auth:auth_password_dev@localhost:5433/resto';
    process.env.NATS_URL = 'nats://localhost:4222';
    process.env.NODE_ENV = 'test';
    process.env.OTEL_DISABLED = 'true';
    process.env.NATS_DISABLED = 'true';
    process.env.BETTER_AUTH_SECRET = 'signup-e2e-secret-padding-padding-padding-padding';
    process.env.BETTER_AUTH_BASE_URL = 'http://localhost:4000';
    process.env.ADMIN_WEB_URL = 'http://localhost:3000';
    process.env.INTERNAL_API_TOKEN = INTERNAL_TOKEN;
    process.env.S3_ENDPOINT = 'http://localhost:9000';
    process.env.S3_ACCESS_KEY = 'x';
    process.env.S3_SECRET_KEY = 'x';
    process.env.RATE_LIMIT_AUTH_SIGNUP_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_PUBLIC_PER_MIN = '10000';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    authDb = app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  const findTenantByOwnerEmail = async (email: string) => {
    const users = await authDb.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, email));
    const userId = users[0]?.id;
    if (typeof userId !== 'string') throw new Error(`no BA user for ${email}`);

    const members = await authDb.db
      .select({ tenantId: schema.member.tenantId, role: schema.member.role })
      .from(schema.member)
      .where(eq(schema.member.userId, userId));
    expect(members).toHaveLength(1);
    const member = members[0];
    if (!member) throw new Error('expected exactly one member row');

    const tenants = await authDb.db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, member.tenantId));
    const tenant = tenants[0];
    if (!tenant) throw new Error(`no tenant row for member ${member.tenantId}`);
    return { user: users[0], member, tenant };
  };

  it('creates a pending_setup tenant + owner-member on new-email signup; no Set-Cookie', async () => {
    const body = buildSignupBody();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<SignUpResponse>()).toEqual({ status: 'pending_verification' });

    // D-06: NO Set-Cookie on the wire (would leak which branch ran).
    const setCookie = res.headers['set-cookie'];
    expect(setCookie === undefined || (Array.isArray(setCookie) && setCookie.length === 0)).toBe(
      true,
    );

    const { member, tenant } = await findTenantByOwnerEmail(body.email);
    expect(member.role).toBe('owner');
    // D-25/D-30: pending_setup, country applied, currency/locale derived —
    // never the person's submitted name (D-27).
    expect(tenant.status).toBe('pending_setup');
    expect(tenant.country).toBe('GB');
    expect(tenant.defaultCurrency).toBe('GBP');
    expect(tenant.locale).toBe('en');
    expect(tenant.displayName).not.toBe(body.name);
  }, 60_000);

  it('returns identical 201 body on duplicate email — no leak', async () => {
    const body = buildSignupBody();
    const first = await app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: body,
    });
    expect(first.statusCode).toBe(201);
    expect(first.json<SignUpResponse>()).toEqual({ status: 'pending_verification' });

    // D-06: duplicate-email branch returns the SAME 201 + body shape.
    const dup = await app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: { ...body, name: `Different ${randomUUID().slice(0, 6)}` },
    });
    expect(dup.statusCode).toBe(201);
    expect(dup.json<SignUpResponse>()).toEqual({ status: 'pending_verification' });

    // No Set-Cookie on either branch.
    const dupCookie = dup.headers['set-cookie'];
    expect(dupCookie === undefined || (Array.isArray(dupCookie) && dupCookie.length === 0)).toBe(
      true,
    );

    // Exactly one tenant was ever created for this email — the dup branch
    // never provisions a second organization.
    const { member } = await findTenantByOwnerEmail(body.email);
    expect(member.role).toBe('owner');
  }, 60_000);

  it('two people signing up with the same name get distinct provisional slugs', async () => {
    const sameName = `Collision ${randomUUID().slice(0, 6)}`;

    const a = buildSignupBody({ name: sameName });
    const resA = await app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: a,
    });
    expect(resA.statusCode).toBe(201);

    const b = buildSignupBody({ name: sameName });
    const resB = await app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: b,
    });
    expect(resB.statusCode).toBe(201);

    const { tenant: tenantA } = await findTenantByOwnerEmail(a.email);
    const { tenant: tenantB } = await findTenantByOwnerEmail(b.email);
    expect(tenantA.id).not.toBe(tenantB.id);
    expect(tenantA.slug).not.toBe(tenantB.slug);
  }, 60_000);

  it('returns 400 on missing fields (validation never reaches enumeration wrap)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'bad', password: 'x', name: 'X' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 validation.failed for an unsupported country', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: buildSignupBody({ country: 'XX' }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
  });

  it('D-34/D-35: country ES derives defaultCurrency EUR and locale es on the persisted row', async () => {
    const body = buildSignupBody({ country: 'ES' });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: body,
    });
    expect(res.statusCode).toBe(201);

    const { tenant } = await findTenantByOwnerEmail(body.email);
    expect(tenant.country).toBe('ES');
    expect(tenant.defaultCurrency).toBe('EUR');
    expect(tenant.locale).toBe('es');
  }, 60_000);
});
