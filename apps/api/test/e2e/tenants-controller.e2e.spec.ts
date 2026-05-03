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
import { provisionAppRole, provisionAuthRole } from '@resto/db';
import { AppModule } from '../../src/app.module';
import { provisionTenant, runBootstrap, signInAsOperator } from './helpers/operator-fixture';

const MIGRATIONS_DIR = fileURLToPath(
  new URL('../../../../packages/db/migrations', import.meta.url),
);
const APP_PASSWORD = 'app_password_tenants_ctrl_e2e';
const AUTH_PASSWORD = 'auth_password_tenants_ctrl_e2e';
const INTERNAL_TOKEN = 'tenants-ctrl-e2e-internal-token-5678';

describe('TenantsController E2E', () => {
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
    process.env.BETTER_AUTH_SECRET = 'tenants-ctrl-e2e-secret-padding-padding-padding';
    process.env.BETTER_AUTH_BASE_URL = 'http://localhost:4000';
    process.env.ADMIN_WEB_URL = 'http://localhost:3000';
    process.env.INTERNAL_API_TOKEN = INTERNAL_TOKEN;
    // AUTH_COOKIE_DOMAIN intentionally unset — host-only cookies in tests.

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  // ---------------------------------------------------------------------------
  // GET /v1/tenants/me
  // ---------------------------------------------------------------------------

  describe('GET /v1/tenants/me', () => {
    it('returns 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/tenants/me' });
      expect(res.statusCode).toBe(401);
    });

    it("returns the operator's tenant when authenticated", async () => {
      const slug = `op-${randomUUID().slice(0, 8)}`;
      const email = `owner-${slug}@example.com`;
      const password = 'correct-horse-battery-staple-tenants-1';

      const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
      await runBootstrap({ tenantSlug: slug, email, password, name: 'Tenant Me Owner' });
      const cookie = await signInAsOperator(app, email, password, tenant.id);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/tenants/me',
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ id: string; slug: string }>();
      expect(body.id).toBe(tenant.id);
      expect(body.slug).toBe(slug);
    });

    it('does not let operator A read tenant B (cross-tenant isolation)', async () => {
      // Provision two tenants and bootstrap an owner for each.
      const slugA = `iso-a-${randomUUID().slice(0, 8)}`;
      const slugB = `iso-b-${randomUUID().slice(0, 8)}`;
      const passwordA = 'correct-horse-battery-staple-iso-A';
      const passwordB = 'correct-horse-battery-staple-iso-B';
      const emailA = `owner-${slugA}@example.com`;
      const emailB = `owner-${slugB}@example.com`;

      const tenantA = await provisionTenant(app, slugA, INTERNAL_TOKEN);
      const tenantB = await provisionTenant(app, slugB, INTERNAL_TOKEN);
      await runBootstrap({ tenantSlug: slugA, email: emailA, password: passwordA, name: 'A' });
      await runBootstrap({ tenantSlug: slugB, email: emailB, password: passwordB, name: 'B' });

      // Operator A's session: must always see tenant A's snapshot, never B's.
      const cookieA = await signInAsOperator(app, emailA, passwordA, tenantA.id);
      const seenByA = await app.inject({
        method: 'GET',
        url: '/v1/tenants/me',
        headers: { cookie: cookieA },
      });
      expect(seenByA.statusCode).toBe(200);
      const bodyA = seenByA.json<{ id: string; slug: string }>();
      expect(bodyA.id).toBe(tenantA.id);
      expect(bodyA.slug).toBe(slugA);
      expect(bodyA.id).not.toBe(tenantB.id);
      expect(bodyA.slug).not.toBe(slugB);

      // Operator A trying to switch to tenant B's organization id must fail
      // — they are not a member of B.
      const switchAttempt = await app.inject({
        method: 'POST',
        url: '/api/auth/organization/set-active',
        headers: { 'content-type': 'application/json', cookie: cookieA },
        payload: { organizationId: tenantB.id },
      });
      expect(switchAttempt.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/tenants/me/domains
  // ---------------------------------------------------------------------------

  describe('GET /v1/tenants/me/domains', () => {
    it('returns 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/tenants/me/domains' });
      expect(res.statusCode).toBe(401);
    });

    it("returns the operator's tenant domains when authenticated", async () => {
      const slug = `op-${randomUUID().slice(0, 8)}`;
      const email = `owner-${slug}@example.com`;
      const password = 'correct-horse-battery-staple-tenants-2';

      const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
      await runBootstrap({ tenantSlug: slug, email, password, name: 'Tenant Domains Owner' });
      const cookie = await signInAsOperator(app, email, password, tenant.id);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/tenants/me/domains',
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ domain: string; isPrimary: boolean }[]>();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);

      // ProvisionTenantService creates a primary subdomain: <slug>.menu.resto.app
      const expectedDomain = `${slug}.menu.resto.app`;
      const primary = body.find((d) => d.domain === expectedDomain);
      expect(primary).toBeDefined();
      expect(primary?.isPrimary).toBe(true);
    });
  });
});
