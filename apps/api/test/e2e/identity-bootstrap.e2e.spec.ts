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
import { OwnerAlreadyExistsError } from '../../src/contexts/identity/domain/bootstrap-errors';
import {
  provisionTenant,
  runBootstrap,
  signIn,
  signInAsOperator,
} from './helpers/operator-fixture';

const MIGRATIONS_DIR = fileURLToPath(
  new URL('../../../../packages/db/migrations', import.meta.url),
);
const APP_PASSWORD = 'app_password_bootstrap_e2e';
const AUTH_PASSWORD = 'auth_password_bootstrap_e2e';
const INTERNAL_TOKEN = 'bootstrap-e2e-internal-token-1234';

describe('identity bootstrap E2E', () => {
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
    process.env.BETTER_AUTH_SECRET = 'bootstrap-e2e-secret-padding-padding-padding-padding';
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

  it('bootstraps an owner and lets them sign in via BA HTTP', async () => {
    const slug = `bootstrap-${randomUUID().slice(0, 8)}`;
    const email = `owner-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-bootstrap-1';

    // Step 1: provision a fresh tenant.
    const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
    expect(tenant.slug).toBe(slug);

    // Step 2: bootstrap the owner via the standalone BootstrapModule context.
    const bootstrap = await runBootstrap({
      tenantSlug: slug,
      email,
      password,
      name: 'Bootstrap Owner',
    });
    expect(bootstrap.tenantId).toBe(tenant.id);
    expect(bootstrap.userId).toBeTruthy();

    // Step 3: sign in via BA HTTP endpoint.
    const cookie = await signIn(app, email, password);
    expect(cookie).toContain('better-auth.session_token');

    // Step 3b: set the active organization so the session carries tenantId.
    // BA sign-in doesn't auto-select an org; the operator must choose one.
    const activeCookie = await signInAsOperator(app, email, password, tenant.id);

    // Step 4: GET /v1/tenants/me with the active-org session cookie.
    const meRes = await app.inject({
      method: 'GET',
      url: '/v1/tenants/me',
      headers: { cookie: activeCookie },
    });
    expect(meRes.statusCode).toBe(200);
    const body = meRes.json<{ id: string; slug: string }>();
    expect(body.id).toBe(tenant.id);
    expect(body.slug).toBe(slug);
  });

  it('is idempotent: rerunning bootstrap with same email returns same userId', async () => {
    const slug = `bootstrap-${randomUUID().slice(0, 8)}`;
    const email = `owner-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-bootstrap-2';

    await provisionTenant(app, slug, INTERNAL_TOKEN);

    const first = await runBootstrap({
      tenantSlug: slug,
      email,
      password,
      name: 'Idempotent Owner',
    });
    const second = await runBootstrap({
      tenantSlug: slug,
      email,
      password,
      name: 'Idempotent Owner',
    });

    expect(second.userId).toBe(first.userId);
    expect(second.tenantId).toBe(first.tenantId);

    // Verify sign-in still works after a no-op re-bootstrap.
    const cookie = await signIn(app, email, password);
    expect(cookie).toContain('better-auth.session_token');
  });

  it('rejects when a different email is already the owner', async () => {
    const slug = `bootstrap-${randomUUID().slice(0, 8)}`;
    const emailA = `owner-a-${slug}@example.com`;
    const emailB = `owner-b-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-bootstrap-3';

    await provisionTenant(app, slug, INTERNAL_TOKEN);

    // Bootstrap with email A — should succeed.
    await runBootstrap({ tenantSlug: slug, email: emailA, password, name: 'Owner A' });

    // Bootstrap with email B on the same tenant — should throw OwnerAlreadyExistsError.
    await expect(
      runBootstrap({ tenantSlug: slug, email: emailB, password, name: 'Owner B' }),
    ).rejects.toThrow(OwnerAlreadyExistsError);

    // Also verify the error code is correct.
    await expect(
      runBootstrap({ tenantSlug: slug, email: emailB, password, name: 'Owner B' }),
    ).rejects.toMatchObject({ code: 'owner_already_exists' });
  });

  // ---------------------------------------------------------------------------
  // POST /internal/v1/tenants/:id/owner — HTTP surface (RES-113)
  // ---------------------------------------------------------------------------
  describe('POST /internal/v1/tenants/:id/owner', () => {
    it('creates the owner and grants membership', async () => {
      const slug = `bs-http-${randomUUID().slice(0, 8)}`;
      const email = `owner-${slug}@example.com`;
      const password = 'correct-horse-battery-staple-http-1';

      const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);

      const res = await app.inject({
        method: 'POST',
        url: `/internal/v1/tenants/${tenant.id}/owner`,
        headers: { 'x-internal-token': INTERNAL_TOKEN },
        payload: { email, password, name: 'HTTP Owner' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json<{ tenantId: string; userId: string; organizationId: string }>();
      expect(body.tenantId).toBe(tenant.id);
      expect(body.organizationId).toBe(tenant.id);
      expect(body.userId).toBeTruthy();

      // Operator can sign in + set-active using the bootstrapped credentials.
      const cookie = await signInAsOperator(app, email, password, tenant.id);
      const meRes = await app.inject({
        method: 'GET',
        url: '/v1/tenants/me',
        headers: { cookie },
      });
      expect(meRes.statusCode).toBe(200);
      expect(meRes.json<{ slug: string }>().slug).toBe(slug);
    });

    it('rejects without the internal token (401)', async () => {
      const tenant = await provisionTenant(
        app,
        `bs-http-${randomUUID().slice(0, 8)}`,
        INTERNAL_TOKEN,
      );
      const res = await app.inject({
        method: 'POST',
        url: `/internal/v1/tenants/${tenant.id}/owner`,
        payload: {
          email: 'noauth@example.com',
          password: 'correct-horse-battery-staple-no-auth',
          name: 'No Auth',
        },
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 404 for an unknown tenant id', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/internal/v1/tenants/00000000-0000-4000-8000-000000000000/owner',
        headers: { 'x-internal-token': INTERNAL_TOKEN },
        payload: {
          email: 'ghost@example.com',
          password: 'correct-horse-battery-staple-ghost',
          name: 'Ghost',
        },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json<{ type: string }>().type).toContain('bootstrap.tenant_not_found');
    });

    it('returns 409 when a different email is already the owner', async () => {
      const slug = `bs-http-${randomUUID().slice(0, 8)}`;
      const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
      const headers = { 'x-internal-token': INTERNAL_TOKEN };
      const password = 'correct-horse-battery-staple-conflict';

      const first = await app.inject({
        method: 'POST',
        url: `/internal/v1/tenants/${tenant.id}/owner`,
        headers,
        payload: { email: `a-${slug}@example.com`, password, name: 'A' },
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: 'POST',
        url: `/internal/v1/tenants/${tenant.id}/owner`,
        headers,
        payload: { email: `b-${slug}@example.com`, password, name: 'B' },
      });
      expect(second.statusCode).toBe(409);
      expect(second.json<{ type: string }>().type).toContain('bootstrap.owner_already_exists');
    });

    it('rejects a weak password at the body schema (400)', async () => {
      const tenant = await provisionTenant(
        app,
        `bs-http-${randomUUID().slice(0, 8)}`,
        INTERNAL_TOKEN,
      );
      const res = await app.inject({
        method: 'POST',
        url: `/internal/v1/tenants/${tenant.id}/owner`,
        headers: { 'x-internal-token': INTERNAL_TOKEN },
        payload: { email: 'weak@example.com', password: 'short', name: 'Weak' },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
