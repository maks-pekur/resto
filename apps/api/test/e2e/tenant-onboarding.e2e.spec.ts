import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { Test, type TestingModule } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { schema, TenantAwareDb } from '@resto/db';
import { AppModule } from '../../src/app.module';
import { AUTH_DRIZZLE_TOKEN } from '../../src/contexts/identity/identity.tokens';
import type { AuthDrizzle } from '../../src/contexts/identity/infrastructure/better-auth/auth-db';
import { signInAsOperator } from './helpers/operator-fixture';

const INTERNAL_TOKEN = 'tenant-onboarding-e2e-internal-token-123';

/**
 * D-30/D-31 (10.2 plan 13): onboarding names the restaurant, derives its
 * slug and flips `pending_setup` -> `active`. No testcontainer here — same
 * pre-existing 0079 idempotency bug as the sibling signup specs (deferred-
 * items.md, owned by plans 05/19); this spec runs against the live,
 * already-migrated dev Postgres.
 */
describe('POST /v1/me/tenants/onboarding (D-30/D-31)', () => {
  let app: NestFastifyApplication;
  let authDb: AuthDrizzle;
  let db: TenantAwareDb;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'postgres://resto_app:resto_app_dev_password@localhost:5433/resto';
    process.env.BETTER_AUTH_DATABASE_URL =
      'postgres://resto_auth:auth_password_dev@localhost:5433/resto';
    process.env.NATS_URL = 'nats://localhost:4222';
    process.env.NODE_ENV = 'test';
    process.env.OTEL_DISABLED = 'true';
    process.env.NATS_DISABLED = 'true';
    process.env.BETTER_AUTH_SECRET = 'tenant-onboarding-e2e-secret-padding-padding-padding';
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
    // ProvisionTenantService/FinalizeTenantOnboardingService throw without this (07.5-13) —
    // both writers compose the primary tenant_domains row from it.
    process.env.PUBLIC_APEX_DOMAIN = 'resto.app';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    authDb = app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
    db = app.get(TenantAwareDb);
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  /** Signs up a fresh owner and returns their session cookie + pending tenantId. */
  const signUpAndSignIn = async (
    countryOverride = 'GB',
  ): Promise<{ cookie: string; tenantId: string; email: string; password: string }> => {
    const email = `owner-${randomUUID().slice(0, 8)}@example.com`;
    const password = 'a-strong-password-onboarding-12';
    const signupRes = await app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: {
        email,
        password,
        name: `Owner ${randomUUID().slice(0, 6)}`,
        country: countryOverride,
      },
    });
    expect(signupRes.statusCode).toBe(201);

    const users = await authDb.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, email));
    const userId = users[0]?.id;
    if (typeof userId !== 'string') throw new Error(`no BA user for ${email}`);
    const members = await authDb.db
      .select({ tenantId: schema.member.tenantId })
      .from(schema.member)
      .where(eq(schema.member.userId, userId));
    const tenantId = members[0]?.tenantId;
    if (typeof tenantId !== 'string') throw new Error('no member row for new owner');

    const cookie = await signInAsOperator(app, email, password, tenantId);
    return { cookie, tenantId, email, password };
  };

  it('signup -> GET /v1/me/tenants shows pending_setup -> onboarding activates it with a domain row', async () => {
    const { cookie, tenantId } = await signUpAndSignIn();

    const listRes = await app.inject({
      method: 'GET',
      url: '/v1/me/tenants',
      headers: { cookie },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = listRes.json<{ tenants: { id: string; status: string }[] }>();
    const mine = listBody.tenants.find((t) => t.id === tenantId);
    expect(mine?.status).toBe('pending_setup');

    const displayName = `Onboarded Cafe ${randomUUID().slice(0, 6)}`;
    const onboardRes = await app.inject({
      method: 'POST',
      url: '/v1/me/tenants/onboarding',
      headers: { 'content-type': 'application/json', cookie },
      payload: { displayName },
    });
    expect(onboardRes.statusCode).toBe(200);
    const onboardBody = onboardRes.json<{
      id: string;
      slug: string;
      displayName: string;
      status: string;
    }>();
    expect(onboardBody.id).toBe(tenantId);
    expect(onboardBody.displayName).toBe(displayName);
    expect(onboardBody.status).toBe('active');

    const tenant = await db.withoutTenant('inspect onboarded tenant', async (tx) => {
      const rows = await tx.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId));
      return rows[0];
    });
    expect(tenant?.status).toBe('active');
    expect(tenant?.displayName).toBe(displayName);
    expect(tenant?.slug).toBe(onboardBody.slug);

    const domains = await db.withoutTenant('inspect onboarded tenant domains', (tx) =>
      tx.select().from(schema.tenantDomains).where(eq(schema.tenantDomains.tenantId, tenantId)),
    );
    expect(domains).toHaveLength(1);
    expect(domains[0]?.domain).toBe(`${onboardBody.slug}.resto.app`);
    expect(domains[0]?.isPrimary).toBe(true);
  }, 60_000);

  it('a second onboarding submission on the same tenant returns 409', async () => {
    const { cookie } = await signUpAndSignIn();

    const first = await app.inject({
      method: 'POST',
      url: '/v1/me/tenants/onboarding',
      headers: { 'content-type': 'application/json', cookie },
      payload: { displayName: `First Name ${randomUUID().slice(0, 6)}` },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/v1/me/tenants/onboarding',
      headers: { 'content-type': 'application/json', cookie },
      payload: { displayName: `Second Name ${randomUUID().slice(0, 6)}` },
    });
    expect(second.statusCode).toBe(409);
  }, 60_000);

  it('two owners submitting the same restaurant name both succeed with distinct slugs', async () => {
    const ownerA = await signUpAndSignIn();
    const ownerB = await signUpAndSignIn();
    const sameName = `Shared Name ${randomUUID().slice(0, 6)}`;

    const resA = await app.inject({
      method: 'POST',
      url: '/v1/me/tenants/onboarding',
      headers: { 'content-type': 'application/json', cookie: ownerA.cookie },
      payload: { displayName: sameName },
    });
    expect(resA.statusCode).toBe(200);

    const resB = await app.inject({
      method: 'POST',
      url: '/v1/me/tenants/onboarding',
      headers: { 'content-type': 'application/json', cookie: ownerB.cookie },
      payload: { displayName: sameName },
    });
    expect(resB.statusCode).toBe(200);

    const slugA = resA.json<{ slug: string }>().slug;
    const slugB = resB.json<{ slug: string }>().slug;
    expect(slugA).not.toBe(slugB);
  }, 60_000);
});
