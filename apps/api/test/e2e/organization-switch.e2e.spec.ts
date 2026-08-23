import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { schema } from '@resto/db';
import { AppModule } from '../../src/app.module';
import { AUTH_DRIZZLE_TOKEN } from '../../src/contexts/identity/identity.tokens';
import type { AuthDrizzle } from '../../src/contexts/identity/infrastructure/better-auth/auth-db';
import { provisionTenant, runBootstrap, signIn, extractCookies } from './helpers/operator-fixture';

const INTERNAL_TOKEN = 'org-switch-e2e-internal-token-123';

interface SwitchOrganizationBody {
  organizationId: string;
  slug: string;
}

interface GetSessionBody {
  session: { activeOrganizationId?: string | null; activeLocationId?: string | null } | null;
  user: { id: string } | null;
}

describe('POST /api/auth/switch-organization (D-15/D-16)', () => {
  let app: NestFastifyApplication;
  let authDb: AuthDrizzle;

  // No testcontainer here — a fresh-container migration replay of the
  // full chain currently fails on a pre-existing 0079 idempotency bug
  // (`ALTER POLICY organization_role_resto_auth_full` — logged in
  // deferred-items.md under plan 06, owned by plans 05/19, unrelated to
  // this plan's files). The live dev Postgres is already migrated with
  // roles granted (verified read-only before this spec was written); this
  // spec inserts its own uniquely-slugged rows into it rather than
  // rebuilding the database, per this plan's explicit instruction.
  beforeAll(async () => {
    process.env.DATABASE_URL = 'postgres://resto_app:resto_app_dev_password@localhost:5433/resto';
    process.env.BETTER_AUTH_DATABASE_URL =
      'postgres://resto_auth:auth_password_dev@localhost:5433/resto';
    process.env.NATS_URL = 'nats://localhost:4222';
    process.env.NODE_ENV = 'test';
    process.env.OTEL_DISABLED = 'true';
    process.env.NATS_DISABLED = 'true';
    process.env.BETTER_AUTH_SECRET = 'org-switch-e2e-secret-padding-padding-padding';
    process.env.BETTER_AUTH_BASE_URL = 'http://localhost:4000';
    process.env.ADMIN_WEB_URL = 'http://localhost:3000';
    process.env.INTERNAL_API_TOKEN = INTERNAL_TOKEN;
    process.env.S3_ENDPOINT = 'http://localhost:9000';
    process.env.S3_ACCESS_KEY = 'x';
    process.env.S3_SECRET_KEY = 'x';

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

  const addMembership = async (tenantId: string, userId: string): Promise<void> => {
    await authDb.db.insert(schema.member).values({
      id: randomUUID(),
      tenantId,
      userId,
      role: 'staff',
      createdAt: new Date(),
    });
  };

  const getSession = async (cookie: string) => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie },
    });
    return { statusCode: res.statusCode, body: res.json<GetSessionBody>() };
  };

  // Ported from the deleted pre-merge per-restaurant-label pin spec's
  // "D-09 tamper" case (10.2 plan 19): the old session pin field was a
  // plain session.additionalFields entry, directly reachable from a
  // generic session-update call. `activeOrganizationId`/`activeTenantId`
  // is not —
  // it is owned entirely by Better Auth's `organization` plugin and is
  // written only by `setActiveOrganization`/`switch-organization`, both of
  // which verify membership before writing (case 2 proves this from the
  // other direction: a switch to a non-member org is rejected outright).
  // This case pins the architectural guarantee: an unrelated write path
  // cannot forge the field, so nobody can silently regress it back into a
  // directly-settable additionalField.
  it('tamper: /update-user cannot forge activeOrganizationId/activeTenantId', async () => {
    const slug = `orgsw-tamper-${randomUUID().slice(0, 6)}`;
    const email = `owner-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-orgsw-tamper';
    const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password, name: 'Tamper Owner' });
    const cookie = await signIn(app, email, password);

    const forgedTenantId = randomUUID();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/update-user',
      headers: { 'content-type': 'application/json', cookie },
      payload: { activeOrganizationId: forgedTenantId, activeTenantId: forgedTenantId },
    });
    expect(res.statusCode).not.toBe(500);

    const session = await getSession(cookie);
    expect(session.statusCode).toBe(200);
    expect(session.body.session?.activeOrganizationId ?? null).not.toBe(forgedTenantId);

    void tenant;
  }, 60_000);

  it('case 1: switching to B kills the token bound to A and issues one bound to B', async () => {
    const slugA = `orgsw-a-${randomUUID().slice(0, 6)}`;
    const slugB = `orgsw-b-${randomUUID().slice(0, 6)}`;
    const email = `owner-${slugA}@example.com`;
    const password = 'correct-horse-battery-staple-orgsw-1';

    const tenantA = await provisionTenant(app, slugA, INTERNAL_TOKEN);
    const tenantB = await provisionTenant(app, slugB, INTERNAL_TOKEN);
    const { userId } = await runBootstrap({
      tenantSlug: slugA,
      email,
      password,
      name: 'OrgSwitch Owner',
    });
    await addMembership(tenantB.id, userId);

    const freshCookie = await signIn(app, email, password);

    const switchToA = await app.inject({
      method: 'POST',
      url: '/api/auth/switch-organization',
      headers: { 'content-type': 'application/json', cookie: freshCookie },
      payload: { organizationId: tenantA.id },
    });
    expect(switchToA.statusCode).toBe(200);
    const tokenA = extractCookies(switchToA.headers['set-cookie']);
    expect(tokenA).not.toBe('');

    const sessionA = await getSession(tokenA);
    expect(sessionA.body.session?.activeOrganizationId).toBe(tenantA.id);

    const switchToB = await app.inject({
      method: 'POST',
      url: '/api/auth/switch-organization',
      headers: { 'content-type': 'application/json', cookie: tokenA },
      payload: { organizationId: tenantB.id },
    });
    expect(switchToB.statusCode).toBe(200);
    const body = switchToB.json<SwitchOrganizationBody>();
    expect(body.organizationId).toBe(tenantB.id);
    expect(body.slug).toBe(slugB);

    const tokenB = extractCookies(switchToB.headers['set-cookie']);
    expect(tokenB).not.toBe('');
    expect(tokenB).not.toBe(tokenA);

    // (b) the OLD token is dead — not merely stale. `GET /v1/tenants/me`
    // runs through AuthGuard, which resolves the session and 401s when it
    // is absent (unlike `/api/auth/get-session`, which returns 200+null).
    const oldTokenReq = await app.inject({
      method: 'GET',
      url: '/v1/tenants/me',
      headers: { cookie: tokenA, 'x-tenant-slug': slugA },
    });
    expect(oldTokenReq.statusCode).toBe(401);

    // (c) the NEW cookie reports activeOrganizationId === B.
    const sessionB = await getSession(tokenB);
    expect(sessionB.body.session?.activeOrganizationId).toBe(tenantB.id);
  }, 120_000);

  it('case 2: switching to a non-member organization is 403 and leaves the current session usable', async () => {
    const slugA = `orgsw-nm-a-${randomUUID().slice(0, 6)}`;
    const slugC = `orgsw-nm-c-${randomUUID().slice(0, 6)}`;
    const email = `owner-${slugA}@example.com`;
    const password = 'correct-horse-battery-staple-orgsw-2';

    const tenantA = await provisionTenant(app, slugA, INTERNAL_TOKEN);
    const tenantC = await provisionTenant(app, slugC, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slugA, email, password, name: 'NonMember Owner' });

    const cookie = await signIn(app, email, password);

    const switchToC = await app.inject({
      method: 'POST',
      url: '/api/auth/switch-organization',
      headers: { 'content-type': 'application/json', cookie },
      payload: { organizationId: tenantC.id },
    });
    expect(switchToC.statusCode).toBe(403);

    // A failed switch must not revoke anything — the original session
    // still resolves through BA's own session lookup.
    const stillValid = await getSession(cookie);
    expect(stillValid.statusCode).toBe(200);
    expect(stillValid.body.session).not.toBeNull();

    // And it still works against a real AuthGuard-protected route once
    // bound — proves "still valid" means "still usable", not just
    // "BA has not deleted the row yet".
    const switchToA = await app.inject({
      method: 'POST',
      url: '/api/auth/switch-organization',
      headers: { 'content-type': 'application/json', cookie },
      payload: { organizationId: tenantA.id },
    });
    expect(switchToA.statusCode).toBe(200);
  }, 120_000);

  it('case 3: a fresh sign-in has no active organization bound (D-17 premise)', async () => {
    const slugA = `orgsw-fresh-a-${randomUUID().slice(0, 6)}`;
    const slugB = `orgsw-fresh-b-${randomUUID().slice(0, 6)}`;
    const email = `owner-${slugA}@example.com`;
    const password = 'correct-horse-battery-staple-orgsw-3';

    await provisionTenant(app, slugA, INTERNAL_TOKEN);
    const tenantB = await provisionTenant(app, slugB, INTERNAL_TOKEN);
    const { userId } = await runBootstrap({
      tenantSlug: slugA,
      email,
      password,
      name: 'Fresh Owner',
    });
    await addMembership(tenantB.id, userId);

    const cookie = await signIn(app, email, password);
    const session = await getSession(cookie);
    expect(session.statusCode).toBe(200);
    expect(session.body.session?.activeOrganizationId ?? null).toBeNull();
  }, 120_000);

  it('case 4: switching organizations resets activeLocationId to null', async () => {
    const slugA = `orgsw-loc-a-${randomUUID().slice(0, 6)}`;
    const slugB = `orgsw-loc-b-${randomUUID().slice(0, 6)}`;
    const email = `owner-${slugA}@example.com`;
    const password = 'correct-horse-battery-staple-orgsw-4';

    const tenantA = await provisionTenant(app, slugA, INTERNAL_TOKEN);
    const tenantB = await provisionTenant(app, slugB, INTERNAL_TOKEN);
    const { userId } = await runBootstrap({
      tenantSlug: slugA,
      email,
      password,
      name: 'Location Owner',
    });
    await addMembership(tenantB.id, userId);

    const freshCookie = await signIn(app, email, password);
    const switchToA = await app.inject({
      method: 'POST',
      url: '/api/auth/switch-organization',
      headers: { 'content-type': 'application/json', cookie: freshCookie },
      payload: { organizationId: tenantA.id },
    });
    expect(switchToA.statusCode).toBe(200);
    const tokenA = extractCookies(switchToA.headers['set-cookie']);

    // Seed a location pin on the pre-switch session directly — no FK on
    // this column (auth.ts:33), so a synthetic id is enough to prove the
    // reset without depending on the location-pin machinery.
    const fakeLocationId = randomUUID();
    // The session cookie value is `<dbToken>.<signature>` (BA signs the
    // cookie; the DB's session.token column stores only the bare token
    // before the dot) — verified empirically against a live insert, not
    // assumed from the cookie's outward shape.
    const rawToken = (tokenA.split('=').slice(1).join('=').split(';')[0] ?? '').split('.')[0] ?? '';
    await authDb.db
      .update(schema.session)
      .set({ activeLocationId: fakeLocationId })
      .where(eq(schema.session.token, rawToken));

    const beforeSwitch = await getSession(tokenA);
    expect(beforeSwitch.body.session?.activeLocationId).toBe(fakeLocationId);

    const switchToB = await app.inject({
      method: 'POST',
      url: '/api/auth/switch-organization',
      headers: { 'content-type': 'application/json', cookie: tokenA },
      payload: { organizationId: tenantB.id },
    });
    expect(switchToB.statusCode).toBe(200);
    const tokenB = extractCookies(switchToB.headers['set-cookie']);

    const afterSwitch = await getSession(tokenB);
    expect(afterSwitch.body.session?.activeOrganizationId).toBe(tenantB.id);
    expect(afterSwitch.body.session?.activeLocationId ?? null).toBeNull();
  }, 120_000);
});
