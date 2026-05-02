import 'reflect-metadata';
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

const MIGRATIONS_DIR = fileURLToPath(
  new URL('../../../../packages/db/migrations', import.meta.url),
);
const APP_PASSWORD = 'app_password_test';
const AUTH_PASSWORD = 'auth_password_test';

describe('Better Auth /api/auth/* smoke', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    const adminUrl = container.getConnectionUri();

    // Provision both roles + run migrations under the bootstrap superuser.
    const adminClient = postgres(adminUrl);
    await provisionAppRole(adminClient, { appPassword: APP_PASSWORD });
    await provisionAuthRole(adminClient, { authPassword: AUTH_PASSWORD });
    const adminDb = drizzle(adminClient);
    await migrate(adminDb, { migrationsFolder: MIGRATIONS_DIR });
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

  it('POST /api/auth/sign-up/email creates a user and returns a session', async () => {
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
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user?.email).toBe('smoke@example.com');
    expect(body.token).toBeTruthy();
  });

  it('GET /api/auth/get-session with returned cookie returns the user', async () => {
    const signUp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'smoke2@example.com',
        password: 'correct-horse-battery-staple-2',
        name: 'Smoke Two',
      },
    });
    const setCookie = signUp.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join('; ') : (setCookie ?? '');

    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: cookieHeader },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().user?.email).toBe('smoke2@example.com');
  });
});
