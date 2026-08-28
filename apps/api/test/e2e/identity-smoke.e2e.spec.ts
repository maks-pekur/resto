import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import { provisionAppRole, provisionAuthRole } from '@resto/db';
import { AppModule } from '../../src/app.module';
import { provisionTenant, runBootstrap, signIn } from './helpers/operator-fixture';

const MIGRATIONS_DIR = fileURLToPath(
  new URL('../../../../packages/db/migrations', import.meta.url),
);
const APP_PASSWORD = 'app_password_test';
const INTERNAL_TOKEN = 'integration-test-token-1234567890';
const AUTH_PASSWORD = 'auth_password_test';

describe('Better Auth /api/auth/* smoke', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    const adminUrl = container.getConnectionUri();

    // Run migrations, then provision both roles under the bootstrap superuser.
    const adminClient = postgres(adminUrl);
    const adminDb = drizzle(adminClient);
    await migrate(adminDb, { migrationsFolder: MIGRATIONS_DIR });
    await provisionAppRole(adminClient, { appPassword: APP_PASSWORD });
    await provisionAuthRole(adminClient, { authPassword: AUTH_PASSWORD });
    await adminClient.end();

    // Build per-role connection strings.
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
    process.env.BETTER_AUTH_SECRET = 'test-secret-padding-padding-padding-padding-padding';
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
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('GET /api/auth/get-session without cookie returns 200 with null body', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/get-session' });
    expect(res.statusCode).toBe(200);
    // BA returns null (not { data: null, error: null }) when there is no session.
    expect(res.json()).toBeNull();
  });

  it('POST /api/auth/sign-up/email is refused — direct Better Auth signup is closed', async () => {
    // 10.2-13 closed the public BA signup endpoint; an account is created through POST /v1/signup,
    // which owns tenant provisioning. Pinned here because the guard lives in a BA `before` hook,
    // the kind of thing a dependency upgrade can quietly stop invoking.
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'smoke@example.com',
        password: 'correct-horse-battery-staple-1',
        name: 'Smoke Test',
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('signup.direct_disabled');
  });

  it('GET /api/auth/get-session with a signed-in cookie returns the user', async () => {
    const slug = `smoke-${randomUUID().slice(0, 8)}`;
    const email = `owner-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-2';

    await provisionTenant(app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password, name: 'Smoke Two' });
    const cookieHeader = await signIn(app, email, password);

    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: cookieHeader },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().user?.email).toBe(email);
  });

  describe('GET /v1/me', () => {
    it('returns 401 without a session', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/me' });
      expect(res.statusCode).toBe(401);
      // ProblemDetailsFilter serialises errors as RFC 7807. AuthGuard's
      // UnauthorizedException carries `code: 'auth.session_missing'` which
      // the filter promotes into the stable `type` URI suffix.
      const body = res.json();
      expect(body.status).toBe(401);
      expect(body.type).toBe('https://resto.app/problems/auth.session_missing');
    });

    it('returns 200 with operator principal when session is valid', async () => {
      const slug = `smoke-${randomUUID().slice(0, 8)}`;
      const email = `owner-${slug}@example.com`;
      const password = 'correct-horse-battery-staple-3';

      await provisionTenant(app, slug, INTERNAL_TOKEN);
      await runBootstrap({ tenantSlug: slug, email, password, name: 'Me Test' });
      const cookieHeader = await signIn(app, email, password);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: { cookie: cookieHeader },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ kind: 'operator', email });
    });

    // Cross-tenant rejection (operator session bound to tenant A hitting a
    // request resolved to tenant B) is exercised by `tenants-controller.e2e.spec.ts`
    // (RES-126) — kept there because it needs the full provision + bootstrap
    // chain that this smoke spec deliberately avoids.
  });
});
