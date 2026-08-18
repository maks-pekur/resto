import 'reflect-metadata';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { provisionAppRole, provisionAuthRole, schema, TenantAwareDb } from '@resto/db';
import { AppModule } from '../../src/app.module';
import {
  provisionTenant,
  runBootstrap,
  signIn,
  signInAsOperator,
  extractCookies,
} from './helpers/operator-fixture';

const MIGRATIONS_DIR = fileURLToPath(
  new URL('../../../../packages/db/migrations', import.meta.url),
);
const APP_PASSWORD = 'app_password_set_active_brand_e2e';
const AUTH_PASSWORD = 'auth_password_set_active_brand_e2e';
const INTERNAL_TOKEN = 'set-active-brand-e2e-internal-token-123';

describe('POST /v1/me/set-active-brand (D-09)', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let db: TenantAwareDb;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    const adminUrl = container.getConnectionUri();

    const adminClient = postgres(adminUrl);
    const adminDb = drizzle(adminClient);
    await migrate(adminDb, { migrationsFolder: MIGRATIONS_DIR });
    await provisionAppRole(adminClient, { appPassword: APP_PASSWORD });
    await provisionAuthRole(adminClient, { authPassword: AUTH_PASSWORD });
    await adminClient.end();

    const appUrl = new URL(adminUrl);
    appUrl.username = 'resto_app';
    appUrl.password = APP_PASSWORD;

    const authUrl = new URL(adminUrl);
    authUrl.username = 'resto_auth';
    authUrl.password = AUTH_PASSWORD;

    process.env.DATABASE_URL = appUrl.toString();
    process.env.BETTER_AUTH_DATABASE_URL = authUrl.toString();
    process.env.NATS_URL = 'nats://localhost:4222';
    process.env.NODE_ENV = 'test';
    process.env.OTEL_DISABLED = 'true';
    process.env.NATS_DISABLED = 'true';
    process.env.BETTER_AUTH_SECRET = 'set-active-brand-e2e-secret-pad-pad-pad-pad';
    process.env.BETTER_AUTH_BASE_URL = 'http://localhost:4000';
    process.env.ADMIN_WEB_URL = 'http://localhost:3000';
    process.env.INTERNAL_API_TOKEN = INTERNAL_TOKEN;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get(TenantAwareDb);
  }, 240_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('D-09 tamper: /update-session cannot forge activeBrandId', async () => {
    const slug = `sab-tamper-${randomUUID().slice(0, 6)}`;
    const email = `owner-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-sab-tamper';
    const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password, name: 'Tamper Owner' });
    const cookie = await signInAsOperator(app, email, password, tenant.id);

    const forgeBrandId = randomUUID();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/update-user',
      headers: { 'content-type': 'application/json', cookie },
      payload: { activeBrandId: forgeBrandId },
    });
    expect(res.statusCode).not.toBe(500);

    const sessionRes = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie },
    });
    expect(sessionRes.statusCode).toBe(200);
    const session = sessionRes.json<{
      session?: { activeBrandId?: string | null };
    }>();
    expect(session.session?.activeBrandId).not.toBe(forgeBrandId);
  }, 60_000);

  it('owner can re-pin to any tenant brand (200 + slug in body)', async () => {
    const slug = `sab-owner-${randomUUID().slice(0, 6)}`;
    const email = `owner-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-sab-owner';
    const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password, name: 'Re-pin Owner' });
    const cookie = await signInAsOperator(app, email, password, tenant.id);

    const brandAId = randomUUID();
    const brandBId = randomUUID();
    await db.withoutTenant('seed brands for owner re-pin', async (tx) => {
      await tx.insert(schema.brands).values([
        { id: brandAId, tenantId: tenant.id, slug: `${slug}-a`, displayName: 'Brand A' },
        { id: brandBId, tenantId: tenant.id, slug: `${slug}-b`, displayName: 'Brand B' },
      ]);
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/set-active-brand',
      headers: {
        'content-type': 'application/json',
        cookie,
        'x-tenant-slug': slug,
      },
      payload: { brandId: brandBId },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ slug: string }>();
    expect(body.slug).toBe(`${slug}-b`);
  }, 60_000);

  it('non-owner IN scope is still refused — the gate ignores scope entirely (D-14, 08.5)', async () => {
    const slug = `sab-staff-${randomUUID().slice(0, 6)}`;
    const ownerEmail = `owner-${slug}@example.com`;
    const staffEmail = `staff-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-sab-staff';
    const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
    const ownerBootstrap = await runBootstrap({
      tenantSlug: slug,
      email: ownerEmail,
      password,
      name: 'Staff-test Owner',
    });

    const brandAId = randomUUID();
    const brandBId = randomUUID();
    await db.withoutTenant('seed brands for non-owner in-scope', async (tx) => {
      await tx.insert(schema.brands).values([
        { id: brandAId, tenantId: tenant.id, slug: `${slug}-a`, displayName: 'Brand A' },
        { id: brandBId, tenantId: tenant.id, slug: `${slug}-b`, displayName: 'Brand B' },
      ]);
    });

    const staffSignupRes = await app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: staffEmail,
        password,
        displayName: `Staff Tenant ${slug}`,
        defaultCurrency: 'USD',
        locale: 'en',
      },
    });
    expect(staffSignupRes.statusCode).toBe(201);

    const staffAuthDb = db;
    const staffUserRows = await staffAuthDb.withoutTenant('find staff user', (tx) =>
      tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, staffEmail)),
    );
    const staffUserId = staffUserRows[0]?.id;
    if (!staffUserId) throw new Error('staff user not found after signup');

    const staffMemberId = randomUUID();
    await staffAuthDb.withoutTenant('insert staff member + scope', async (tx) => {
      await tx.insert(schema.member).values({
        id: staffMemberId,
        organizationId: tenant.id,
        userId: staffUserId,
        role: 'staff',
        createdAt: new Date(),
      });
      await tx.insert(schema.memberBrandScope).values({
        memberId: staffMemberId,
        brandId: brandAId,
        tenantId: tenant.id,
      });
    });

    await staffAuthDb.withoutTenant('mark staff email verified', (tx) =>
      tx.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, staffUserId)),
    );

    const staffCookie = await signInAsOperator(app, staffEmail, password, tenant.id);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/set-active-brand',
      headers: {
        'content-type': 'application/json',
        cookie: staffCookie,
        'x-tenant-slug': slug,
      },
      payload: { brandId: brandAId },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json<{ code?: string }>().code).toBe('identity.non_owner_brand_switch_forbidden');

    void ownerBootstrap;
  }, 90_000);

  it('non-owner out-of-scope: returns 403 identity.non_owner_brand_switch_forbidden (D-14, 08.5)', async () => {
    const slug = `sab-scope-${randomUUID().slice(0, 6)}`;
    const ownerEmail = `owner-${slug}@example.com`;
    const staffEmail = `staff-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-sab-scope';
    const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email: ownerEmail, password, name: 'Scope Owner' });

    const brandAId = randomUUID();
    const brandBId = randomUUID();
    await db.withoutTenant('seed brands for out-of-scope test', async (tx) => {
      await tx.insert(schema.brands).values([
        { id: brandAId, tenantId: tenant.id, slug: `${slug}-a`, displayName: 'Brand A' },
        { id: brandBId, tenantId: tenant.id, slug: `${slug}-b`, displayName: 'Brand B' },
      ]);
    });

    const staffSignupRes = await app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: staffEmail,
        password,
        displayName: `OOS Tenant ${slug}`,
        defaultCurrency: 'USD',
        locale: 'en',
      },
    });
    expect(staffSignupRes.statusCode).toBe(201);

    const staffUserRows = await db.withoutTenant('find oos staff user', (tx) =>
      tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, staffEmail)),
    );
    const staffUserId = staffUserRows[0]?.id;
    if (!staffUserId) throw new Error('staff user not found');

    const staffMemberId = randomUUID();
    await db.withoutTenant('insert oos staff member + scope for brandA only', async (tx) => {
      await tx.insert(schema.member).values({
        id: staffMemberId,
        organizationId: tenant.id,
        userId: staffUserId,
        role: 'staff',
        createdAt: new Date(),
      });
      await tx.insert(schema.memberBrandScope).values({
        memberId: staffMemberId,
        brandId: brandAId,
        tenantId: tenant.id,
      });
      await tx
        .update(schema.user)
        .set({ emailVerified: true })
        .where(eq(schema.user.id, staffUserId));
    });

    const staffCookie = await signInAsOperator(app, staffEmail, password, tenant.id);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/set-active-brand',
      headers: {
        'content-type': 'application/json',
        cookie: staffCookie,
        'x-tenant-slug': slug,
      },
      payload: { brandId: brandBId },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json<{ code?: string }>();
    // D-14 (08.5): non-owner set-active-brand is closed outright — the 403 now
    // fires before any scope check, so out-of-scope and in-scope non-owners
    // get the identical identity.non_owner_brand_switch_forbidden code.
    expect(body.code).toBe('identity.non_owner_brand_switch_forbidden');
  }, 90_000);

  it('deterministic initial pin: after set-active, activeBrandId is non-null on session', async () => {
    const slug = `sab-init-${randomUUID().slice(0, 6)}`;
    const email = `owner-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-sab-init';
    const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password, name: 'Init Brand Owner' });

    const brandId = randomUUID();
    await db.withoutTenant('seed brand for deterministic init pin', async (tx) => {
      await tx.insert(schema.brands).values({
        id: brandId,
        tenantId: tenant.id,
        slug: `${slug}-only`,
        displayName: 'Only Brand',
      });
    });

    const cookie = await signIn(app, email, password);
    const setActiveRes = await app.inject({
      method: 'POST',
      url: '/api/auth/organization/set-active',
      headers: { 'content-type': 'application/json', cookie },
      payload: { organizationId: tenant.id },
    });
    expect(setActiveRes.statusCode).toBe(200);
    const freshCookie = extractCookies(setActiveRes.headers['set-cookie']) || cookie;

    const sessionRes = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: freshCookie },
    });
    expect(sessionRes.statusCode).toBe(200);
    const session = sessionRes.json<{
      session?: { activeBrandId?: string | null; activeOrganizationId?: string | null };
    }>();
    expect(session.session?.activeOrganizationId).toBe(tenant.id);
    expect(session.session?.activeBrandId).toBe(brandId);
  }, 90_000);

  it('D-13: non-owner scoped to 2 brands gets deterministic initial pin = earliest brand (created_at ASC, id ASC)', async () => {
    const slug = `sab-d13-${randomUUID().slice(0, 6)}`;
    const ownerEmail = `owner-${slug}@example.com`;
    const staffEmail = `staff-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-sab-d13';
    const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email: ownerEmail, password, name: 'D13 Owner' });

    const brandEarlierCreatedAt = new Date(Date.now() - 5_000);
    const brandLaterCreatedAt = new Date(Date.now() - 1_000);
    const brandAId = randomUUID();
    const brandBId = randomUUID();
    await db.withoutTenant('seed 2 brands for d13 test', async (tx) => {
      await tx.insert(schema.brands).values([
        {
          id: brandAId,
          tenantId: tenant.id,
          slug: `${slug}-a`,
          displayName: 'Brand A',
          createdAt: brandEarlierCreatedAt,
        },
        {
          id: brandBId,
          tenantId: tenant.id,
          slug: `${slug}-b`,
          displayName: 'Brand B',
          createdAt: brandLaterCreatedAt,
        },
      ]);
    });

    const staffSignupRes = await app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: staffEmail,
        password,
        displayName: `D13 Staff ${slug}`,
        defaultCurrency: 'USD',
        locale: 'en',
      },
    });
    expect(staffSignupRes.statusCode).toBe(201);

    const staffUserRows = await db.withoutTenant('find d13 staff user', (tx) =>
      tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, staffEmail)),
    );
    const staffUserId = staffUserRows[0]?.id;
    if (!staffUserId) throw new Error('staff user not found after signup');

    const staffMemberId = randomUUID();
    await db.withoutTenant('insert d13 staff member + 2 brand scopes', async (tx) => {
      await tx.insert(schema.member).values({
        id: staffMemberId,
        organizationId: tenant.id,
        userId: staffUserId,
        role: 'staff',
        createdAt: new Date(),
      });
      const locationAId = randomUUID();
      const locationBId = randomUUID();
      await tx.insert(schema.locations).values([
        { id: locationAId, brandId: brandAId, tenantId: tenant.id, name: 'A location' },
        { id: locationBId, brandId: brandBId, tenantId: tenant.id, name: 'B location' },
      ]);
      await tx.insert(schema.memberLocationScope).values([
        { memberId: staffMemberId, locationId: locationAId, tenantId: tenant.id, role: 'staff' },
        { memberId: staffMemberId, locationId: locationBId, tenantId: tenant.id, role: 'staff' },
      ]);
      await tx
        .update(schema.user)
        .set({ emailVerified: true })
        .where(eq(schema.user.id, staffUserId));
    });

    const cookie = await signIn(app, staffEmail, password);
    const setActiveRes = await app.inject({
      method: 'POST',
      url: '/api/auth/organization/set-active',
      headers: { 'content-type': 'application/json', cookie },
      payload: { organizationId: tenant.id },
    });
    expect(setActiveRes.statusCode).toBe(200);
    const freshCookie = extractCookies(setActiveRes.headers['set-cookie']) || cookie;

    const sessionRes = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: freshCookie },
    });
    expect(sessionRes.statusCode).toBe(200);
    const session = sessionRes.json<{
      session?: { activeBrandId?: string | null; activeOrganizationId?: string | null };
    }>();
    expect(session.session?.activeOrganizationId).toBe(tenant.id);
    expect(session.session?.activeBrandId).not.toBeNull();
    expect(session.session?.activeBrandId).toBe(brandAId);

    const setActiveRes2 = await app.inject({
      method: 'POST',
      url: '/api/auth/organization/set-active',
      headers: { 'content-type': 'application/json', cookie: freshCookie },
      payload: { organizationId: tenant.id },
    });
    expect(setActiveRes2.statusCode).toBe(200);
    const stableCookie = extractCookies(setActiveRes2.headers['set-cookie']) || freshCookie;

    const sessionRes2 = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: stableCookie },
    });
    expect(sessionRes2.statusCode).toBe(200);
    const session2 = sessionRes2.json<{
      session?: { activeBrandId?: string | null };
    }>();
    expect(session2.session?.activeBrandId).toBe(brandAId);
  }, 120_000);

  it('401 when unauthenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/set-active-brand',
      headers: { 'content-type': 'application/json', 'x-tenant-slug': 'any' },
      payload: { brandId: randomUUID() },
    });
    expect(res.statusCode).toBe(401);
  }, 30_000);

  it('400 on invalid brandId (not a UUID)', async () => {
    const slug = `sab-val-${randomUUID().slice(0, 6)}`;
    const email = `owner-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-sab-val';
    const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password, name: 'Val Owner' });
    const cookie = await signInAsOperator(app, email, password, tenant.id);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/set-active-brand',
      headers: {
        'content-type': 'application/json',
        cookie,
        'x-tenant-slug': slug,
      },
      payload: { brandId: 'not-a-uuid' },
    });
    expect(res.statusCode).toBe(400);
  }, 60_000);

  it('403 when owner tries a brand from a different tenant', async () => {
    const slugA = `sab-cross-a-${randomUUID().slice(0, 6)}`;
    const slugB = `sab-cross-b-${randomUUID().slice(0, 6)}`;
    const emailA = `owner-${slugA}@example.com`;
    const emailB = `owner-${slugB}@example.com`;
    const password = 'correct-horse-battery-staple-sab-cross';

    const tenantA = await provisionTenant(app, slugA, INTERNAL_TOKEN);
    const tenantB = await provisionTenant(app, slugB, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slugA, email: emailA, password, name: 'Cross Owner A' });
    await runBootstrap({ tenantSlug: slugB, email: emailB, password, name: 'Cross Owner B' });

    const cookieA = await signInAsOperator(app, emailA, password, tenantA.id);

    const brandBId = randomUUID();
    await db.withoutTenant('seed brand for cross-tenant test', async (tx) => {
      await tx.insert(schema.brands).values({
        id: brandBId,
        tenantId: tenantB.id,
        slug: `${slugB}-brand`,
        displayName: 'Tenant B Brand',
      });
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/set-active-brand',
      headers: {
        'content-type': 'application/json',
        cookie: cookieA,
        'x-tenant-slug': slugA,
      },
      payload: { brandId: brandBId },
    });
    expect(res.statusCode).toBe(403);
  }, 90_000);

  it('non-owner staff with no scope rows: 403 identity.non_owner_brand_switch_forbidden (D-14, 08.5)', async () => {
    const slug = `sab-noscope-${randomUUID().slice(0, 6)}`;
    const ownerEmail = `owner-${slug}@example.com`;
    const staffEmail = `staff-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-sab-noscope';
    const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email: ownerEmail, password, name: 'NoScope Owner' });

    const brandId = randomUUID();
    await db.withoutTenant('seed brand for no-scope test', async (tx) => {
      await tx.insert(schema.brands).values({
        id: brandId,
        tenantId: tenant.id,
        slug: `${slug}-brand`,
        displayName: 'Some Brand',
      });
    });

    const staffSignupRes = await app.inject({
      method: 'POST',
      url: '/v1/signup',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: staffEmail,
        password,
        displayName: `NoScope Tenant ${slug}`,
        defaultCurrency: 'USD',
        locale: 'en',
      },
    });
    expect(staffSignupRes.statusCode).toBe(201);

    const staffUserRows = await db.withoutTenant('find noscope staff user', (tx) =>
      tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, staffEmail)),
    );
    const staffUserId = staffUserRows[0]?.id;
    if (!staffUserId) throw new Error('staff user not found');

    await db.withoutTenant('insert noscope staff without scope rows', async (tx) => {
      await tx.insert(schema.member).values({
        id: randomUUID(),
        organizationId: tenant.id,
        userId: staffUserId,
        role: 'staff',
        createdAt: new Date(),
      });
      await tx
        .update(schema.user)
        .set({ emailVerified: true })
        .where(eq(schema.user.id, staffUserId));
    });

    const staffCookie = await signInAsOperator(app, staffEmail, password, tenant.id);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/set-active-brand',
      headers: {
        'content-type': 'application/json',
        cookie: staffCookie,
        'x-tenant-slug': slug,
      },
      payload: { brandId },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json<{ code?: string }>();
    // D-14 (08.5): closed for every non-owner regardless of scope state.
    expect(body.code).toBe('identity.non_owner_brand_switch_forbidden');
  }, 90_000);
});
