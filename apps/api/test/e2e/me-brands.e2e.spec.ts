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
import { and, eq } from 'drizzle-orm';
import { provisionAppRole, provisionAuthRole, schema, TenantAwareDb } from '@resto/db';
import { AppModule } from '../../src/app.module';
import { provisionTenant, runBootstrap, signInAsOperator } from './helpers/operator-fixture';

const MIGRATIONS_DIR = fileURLToPath(
  new URL('../../../../packages/db/migrations', import.meta.url),
);
const APP_PASSWORD = 'app_password_me_brands_e2e';
const AUTH_PASSWORD = 'auth_password_me_brands_e2e';
const INTERNAL_TOKEN = 'me-brands-e2e-internal-token-1234567';

describe('GET + POST /v1/me/brands', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    const adminUrl = container.getConnectionUri();

    const adminClient = postgres(adminUrl);
    await provisionAppRole(adminClient, { appPassword: APP_PASSWORD });
    await provisionAuthRole(adminClient, { authPassword: AUTH_PASSWORD });
    const adminDb = drizzle(adminClient);
    await migrate(adminDb, { migrationsFolder: MIGRATIONS_DIR });
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
    process.env.BETTER_AUTH_SECRET = 'me-brands-e2e-secret-padding-padding-padding';
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
  }, 240_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('returns all tenant brands and canViewAllBrands=true when scope is empty', async () => {
    const slug = `mb-${randomUUID().slice(0, 8)}`;
    const email = `owner-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-mb-1';
    const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password, name: 'Brands Owner' });
    const cookie = await signInAsOperator(app, email, password, tenant.id);

    const db = app.get(TenantAwareDb);
    const defaultBrandId = randomUUID();
    const extraA = randomUUID();
    const extraB = randomUUID();
    await db.withoutTenant('seed brands for me-brands e2e (empty scope)', async (tx) => {
      await tx.insert(schema.brands).values([
        { id: defaultBrandId, tenantId: tenant.id, slug: slug, displayName: 'Default' },
        { id: extraA, tenantId: tenant.id, slug: `${slug}-extra-a`, displayName: 'Extra A' },
        { id: extraB, tenantId: tenant.id, slug: `${slug}-extra-b`, displayName: 'Extra B' },
      ]);
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/me/brands',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      brands: { id: string; slug: string; displayName: string }[];
      canViewAllBrands: boolean;
    }>();
    expect(body.canViewAllBrands).toBe(true);
    const slugs = body.brands.map((b) => b.slug).sort();
    expect(slugs).toEqual([slug, `${slug}-extra-a`, `${slug}-extra-b`].sort());
  }, 60_000);

  it('returns only the scoped subset and canViewAllBrands=false when member_brand_scope is set', async () => {
    const slug = `mb-${randomUUID().slice(0, 8)}`;
    const email = `owner-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-mb-2';
    const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
    const bootstrap = await runBootstrap({
      tenantSlug: slug,
      email,
      password,
      name: 'Scoped Owner',
    });
    const cookie = await signInAsOperator(app, email, password, tenant.id);

    const db = app.get(TenantAwareDb);
    const extraA = randomUUID();
    const extraB = randomUUID();
    await db.withoutTenant('seed scoped fixture', async (tx) => {
      await tx.insert(schema.brands).values([
        { id: extraA, tenantId: tenant.id, slug: `${slug}-extra-a`, displayName: 'Extra A' },
        { id: extraB, tenantId: tenant.id, slug: `${slug}-extra-b`, displayName: 'Extra B' },
      ]);

      const memberRows = await tx
        .select({ id: schema.member.id })
        .from(schema.member)
        .where(
          and(
            eq(schema.member.userId, bootstrap.userId),
            eq(schema.member.organizationId, tenant.id),
          ),
        )
        .limit(1);
      const memberId = memberRows[0]?.id;
      if (!memberId) throw new Error('member row missing after bootstrap');

      await tx.insert(schema.memberBrandScope).values({
        memberId,
        brandId: extraA,
        tenantId: tenant.id,
      });
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/me/brands',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      brands: { slug: string }[];
      canViewAllBrands: boolean;
    }>();
    expect(body.canViewAllBrands).toBe(false);
    expect(body.brands.map((b) => b.slug)).toEqual([`${slug}-extra-a`]);
  }, 60_000);

  it('POST /v1/me/brands creates a brand for the operator tenant', async () => {
    const slug = `mb-${randomUUID().slice(0, 8)}`;
    const email = `owner-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-mb-3';
    const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password, name: 'POST Owner' });
    const cookie = await signInAsOperator(app, email, password, tenant.id);

    const newSlug = `${slug}-fresh`;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/me/brands',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { slug: newSlug, displayName: 'Fresh Brand' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; slug: string; displayName: string }>();
    expect(body.slug).toBe(newSlug);
    expect(body.displayName).toBe('Fresh Brand');
    expect(body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  }, 60_000);

  it('POST /v1/me/brands is idempotent on (tenantId, slug) — returns the existing brand', async () => {
    const slug = `mb-${randomUUID().slice(0, 8)}`;
    const email = `owner-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-mb-4';
    const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password, name: 'Idempotent Owner' });
    const cookie = await signInAsOperator(app, email, password, tenant.id);

    const dupeSlug = `${slug}-dupe`;
    const first = await app.inject({
      method: 'POST',
      url: '/v1/me/brands',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { slug: dupeSlug, displayName: 'Dupe Brand' },
    });
    expect(first.statusCode).toBe(201);
    const firstBody = first.json<{ id: string }>();

    const second = await app.inject({
      method: 'POST',
      url: '/v1/me/brands',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { slug: dupeSlug, displayName: 'Dupe Brand' },
    });
    expect(second.statusCode).toBe(201);
    const secondBody = second.json<{ id: string }>();
    expect(secondBody.id).toBe(firstBody.id);
  }, 60_000);

  it('POST /v1/me/brands returns 409 when slug is globally taken by another tenant', async () => {
    const slugA = `mb-${randomUUID().slice(0, 8)}`;
    const slugB = `mb-${randomUUID().slice(0, 8)}`;
    const passwordA = 'correct-horse-battery-staple-mb-5a';
    const passwordB = 'correct-horse-battery-staple-mb-5b';
    const emailA = `owner-${slugA}@example.com`;
    const emailB = `owner-${slugB}@example.com`;

    const tenantA = await provisionTenant(app, slugA, INTERNAL_TOKEN);
    const tenantB = await provisionTenant(app, slugB, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slugA, email: emailA, password: passwordA, name: 'A' });
    await runBootstrap({ tenantSlug: slugB, email: emailB, password: passwordB, name: 'B' });

    const sharedSlug = `mb-shared-${randomUUID().slice(0, 8)}`;
    const cookieA = await signInAsOperator(app, emailA, passwordA, tenantA.id);
    const okA = await app.inject({
      method: 'POST',
      url: '/v1/me/brands',
      headers: { cookie: cookieA, 'content-type': 'application/json' },
      payload: { slug: sharedSlug, displayName: 'A Brand' },
    });
    expect(okA.statusCode).toBe(201);

    const cookieB = await signInAsOperator(app, emailB, passwordB, tenantB.id);
    const conflict = await app.inject({
      method: 'POST',
      url: '/v1/me/brands',
      headers: { cookie: cookieB, 'content-type': 'application/json' },
      payload: { slug: sharedSlug, displayName: 'B Brand' },
    });
    expect(conflict.statusCode).toBe(409);
    const body = conflict.json<{ type: string; status: number }>();
    expect(body.status).toBe(409);
    expect(body.type).toBe('https://resto.app/problems/brand.slug_taken');
  }, 60_000);
});
