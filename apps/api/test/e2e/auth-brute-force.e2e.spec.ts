import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { provisionAppRole, provisionAuthRole } from '@resto/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { loadEnv } from '../../src/config/env.schema';
import { registerSecurity } from '../../src/shared/security';

const MIGRATIONS_DIR = fileURLToPath(
  new URL('../../../../packages/db/migrations', import.meta.url),
);
const APP_PASSWORD = 'app_password_brute_force_e2e';
const AUTH_PASSWORD = 'auth_password_brute_force_e2e';

describe('Auth brute-force throttle (RES-137/169)', () => {
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
    process.env.BETTER_AUTH_SECRET = 'brute-force-e2e-secret-padding-padding-padding';
    process.env.BETTER_AUTH_BASE_URL = 'http://localhost:4000';
    process.env.ADMIN_WEB_URL = 'http://localhost:3000';
    process.env.RATE_LIMIT_AUTH_SIGNUP_PER_MIN = '3';
    process.env.RATE_LIMIT_AUTH_RESET_PER_MIN = '3';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '3';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '3';
    process.env.RATE_LIMIT_AUTH_RESET_PER_EMAIL_PER_MIN = '3';
    // Keep general public/internal high so they don't shadow our per-endpoint limits in the dispatcher.
    process.env.RATE_LIMIT_PUBLIC_PER_MIN = '10000';
    process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    const env = loadEnv();
    await registerSecurity(app, env);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('returns 429 on the 4th sign-up request from the same IP within a minute', async () => {
    const remoteAddress = `10.20.${randomUUID().slice(0, 2)}.${randomUUID().slice(2, 4)}`;
    for (let i = 0; i < 3; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-up/email',
        remoteAddress,
        headers: { 'content-type': 'application/json' },
        payload: {
          email: `bf-signup-${randomUUID().slice(0, 8)}@example.test`,
          password: 'correct-horse-battery-staple-12',
          name: 'Brute Force',
        },
      });
      expect(res.statusCode).not.toBe(429);
    }
    const limited = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      remoteAddress,
      headers: { 'content-type': 'application/json' },
      payload: {
        email: `bf-signup-${randomUUID().slice(0, 8)}@example.test`,
        password: 'correct-horse-battery-staple-12',
        name: 'Brute Force',
      },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['content-type']).toContain('application/problem+json');
  });

  it('returns 429 on the 4th request-password-reset request from the same IP within a minute', async () => {
    const remoteAddress = `10.21.${randomUUID().slice(0, 2)}.${randomUUID().slice(2, 4)}`;
    for (let i = 0; i < 3; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/request-password-reset',
        remoteAddress,
        headers: { 'content-type': 'application/json' },
        payload: { email: `bf-reset-${randomUUID().slice(0, 8)}@example.test` },
      });
      expect(res.statusCode).not.toBe(429);
    }
    const limited = await app.inject({
      method: 'POST',
      url: '/api/auth/request-password-reset',
      remoteAddress,
      headers: { 'content-type': 'application/json' },
      payload: { email: `bf-reset-${randomUUID().slice(0, 8)}@example.test` },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['content-type']).toContain('application/problem+json');
  });

  it('returns 429 on the 4th sign-in/email request from the same IP within a minute', async () => {
    const remoteAddress = `10.22.${randomUUID().slice(0, 2)}.${randomUUID().slice(2, 4)}`;
    for (let i = 0; i < 3; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        remoteAddress,
        headers: { 'content-type': 'application/json' },
        payload: {
          email: `bf-signin-${randomUUID().slice(0, 8)}@example.test`,
          password: 'wrong-password-12',
        },
      });
      expect(res.statusCode).not.toBe(429);
    }
    const limited = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      remoteAddress,
      headers: { 'content-type': 'application/json' },
      payload: {
        email: `bf-signin-${randomUUID().slice(0, 8)}@example.test`,
        password: 'wrong-password-12',
      },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['content-type']).toContain('application/problem+json');
  });

  it('returns 429 on the 4th /v1/signup request from the same IP within a minute (RES-189)', async () => {
    const remoteAddress = `10.25.${randomUUID().slice(0, 2)}.${randomUUID().slice(2, 4)}`;
    for (let i = 0; i < 3; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/signup',
        remoteAddress,
        headers: { 'content-type': 'application/json' },
        payload: { email: 'bad', password: 'x', displayName: 'X' },
      });
      expect(res.statusCode).not.toBe(429);
    }
    const limited = await app.inject({
      method: 'POST',
      url: '/v1/signup',
      remoteAddress,
      headers: { 'content-type': 'application/json' },
      payload: { email: 'bad', password: 'x', displayName: 'X' },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['content-type']).toContain('application/problem+json');
  });

  it('returns 429 on the 4th sign-in/email for the same email regardless of source IP (RES-188)', async () => {
    const email = `bf-per-email-${randomUUID().slice(0, 8)}@example.test`;
    for (let i = 0; i < 3; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        remoteAddress: `10.24.${i.toString()}.${randomUUID().slice(0, 2)}`,
        headers: { 'content-type': 'application/json' },
        payload: { email, password: 'wrong-password-12' },
      });
      expect(res.statusCode).not.toBe(429);
    }
    const limited = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      remoteAddress: `10.24.99.${randomUUID().slice(0, 2)}`,
      headers: { 'content-type': 'application/json' },
      payload: { email, password: 'wrong-password-12' },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['content-type']).toContain('application/problem+json');
  });

  it('returns 429 on the 4th request-password-reset for the same email regardless of source IP (RES-169)', async () => {
    const email = `bf-per-email-reset-${randomUUID().slice(0, 8)}@example.test`;
    for (let i = 0; i < 3; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/request-password-reset',
        remoteAddress: `10.26.${i.toString()}.${randomUUID().slice(0, 2)}`,
        headers: { 'content-type': 'application/json' },
        payload: { email },
      });
      expect(res.statusCode).not.toBe(429);
    }
    const limited = await app.inject({
      method: 'POST',
      url: '/api/auth/request-password-reset',
      remoteAddress: `10.26.99.${randomUUID().slice(0, 2)}`,
      headers: { 'content-type': 'application/json' },
      payload: { email },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['content-type']).toContain('application/problem+json');
  });

  it('does not honor a forged X-Forwarded-For when TRUST_PROXY is unset (RES-185)', async () => {
    const realIp = `10.23.${randomUUID().slice(0, 2)}.${randomUUID().slice(2, 4)}`;
    for (let i = 0; i < 3; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-up/email',
        remoteAddress: realIp,
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': `10.99.99.${i.toString()}`,
        },
        payload: {
          email: `bf-xff-${randomUUID().slice(0, 8)}@example.test`,
          password: 'correct-horse-battery-staple-12',
          name: 'XFF Test',
        },
      });
      expect(res.statusCode).not.toBe(429);
    }

    const limited = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      remoteAddress: realIp,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': `10.88.88.88`,
      },
      payload: {
        email: `bf-xff-${randomUUID().slice(0, 8)}@example.test`,
        password: 'correct-horse-battery-staple-12',
        name: 'XFF Test',
      },
    });
    expect(limited.statusCode).toBe(429);
  });
});
