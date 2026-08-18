import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { TenantAwareDb } from '@resto/db';
import { AppModule } from '../../src/app.module';
import { loadEnv } from '../../src/config/env.schema';
import { registerSecurity } from '../../src/shared/security';

const buildDbStub = (): TenantAwareDb =>
  ({
    connection: {
      raw: undefined,
      db: { execute: (): Promise<unknown[]> => Promise.resolve([]) },
    },
    close: (): Promise<void> => Promise.resolve(),
    withoutTenant: async <T>(_reason: string, fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({ limit: (): Promise<unknown[]> => Promise.resolve([]) }),
          }),
        }),
      };
      return fn(tx);
    },
    withTenant: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn({}),
  }) as unknown as TenantAwareDb;

const baseTestEnv = (): void => {
  process.env.DATABASE_URL = 'postgres://app@localhost:5432/resto';
  process.env.NATS_URL = 'nats://localhost:4222';
  process.env.NODE_ENV = 'test';
  process.env.OTEL_DISABLED = 'true';
  process.env.NATS_DISABLED = 'true';
};

const createApp = async (): Promise<NestFastifyApplication> => {
  const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TenantAwareDb)
    .useValue(buildDbStub())
    .compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ logger: false }),
  );
  await registerSecurity(app, loadEnv());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
};

describe('Security middleware (RES-99)', () => {
  describe('helmet', () => {
    let app: NestFastifyApplication;

    beforeAll(async () => {
      baseTestEnv();
      delete process.env.CORS_ALLOWED_ORIGINS;
      delete process.env.RATE_LIMIT_PUBLIC_PER_MIN;
      delete process.env.RATE_LIMIT_INTERNAL_PER_MIN;
      app = await createApp();
    });

    afterAll(async () => {
      await app.close();
    });

    it('sets standard hardening headers on every response', async () => {
      const res = await app.inject({ method: 'GET', url: '/healthz' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['strict-transport-security']).toBeDefined();
    });
  });

  describe('CORS', () => {
    let app: NestFastifyApplication;

    beforeAll(async () => {
      baseTestEnv();
      process.env.CORS_ALLOWED_ORIGINS = 'https://admin.resto.app,https://*.menu.resto.app';
      delete process.env.RATE_LIMIT_PUBLIC_PER_MIN;
      delete process.env.RATE_LIMIT_INTERNAL_PER_MIN;
      app = await createApp();
    });

    afterAll(async () => {
      await app.close();
    });

    it('allows preflight from a literal allowlisted origin', async () => {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/healthz',
        headers: {
          origin: 'https://admin.resto.app',
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'content-type',
        },
      });
      expect(res.statusCode).toBeLessThan(300);
      expect(res.headers['access-control-allow-origin']).toBe('https://admin.resto.app');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('allows preflight from a tenant subdomain that matches the wildcard', async () => {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/healthz',
        headers: {
          origin: 'https://cafe-roma.menu.resto.app',
          'access-control-request-method': 'GET',
        },
      });
      expect(res.statusCode).toBeLessThan(300);
      expect(res.headers['access-control-allow-origin']).toBe('https://cafe-roma.menu.resto.app');
    });

    it('rejects preflight from an off-list origin (no allow-origin header)', async () => {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/healthz',
        headers: {
          origin: 'https://evil.example.com',
          'access-control-request-method': 'GET',
        },
      });
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('refuses to match a wildcard across multiple subdomain segments', async () => {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/healthz',
        headers: {
          origin: 'https://a.b.menu.resto.app',
          'access-control-request-method': 'GET',
        },
      });
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('rate limit', () => {
    let app: NestFastifyApplication;

    beforeAll(async () => {
      baseTestEnv();
      delete process.env.CORS_ALLOWED_ORIGINS;
      process.env.RATE_LIMIT_PUBLIC_PER_MIN = '3';
      process.env.RATE_LIMIT_INTERNAL_PER_MIN = '1';
      app = await createApp();
    });

    afterAll(async () => {
      await app.close();
    });

    it('rate-limits /readyz (Nest controller) with problem+json after the limit', async () => {
      const remoteAddress = '10.20.30.41';
      for (let i = 0; i < 3; i += 1) {
        const res = await app.inject({ method: 'GET', url: '/readyz', remoteAddress });
        expect(res.statusCode).not.toBe(429);
      }
      const limited = await app.inject({ method: 'GET', url: '/readyz', remoteAddress });
      expect(limited.statusCode).toBe(429);
      expect(limited.headers['content-type']).toContain('application/problem+json');
      const body: Record<string, unknown> = limited.json();
      expect(body.type).toBe('https://resto.app/problems/rate-limit-exceeded');
      expect(body.status).toBe(429);
      expect(body.title).toBe('Too Many Requests');
      expect(body.instance).toBe('/readyz');
    });

    it('honours the stricter limit on /internal/v1/* routes', async () => {
      const remoteAddress = '10.20.30.42';
      // RATE_LIMIT_INTERNAL_PER_MIN=1 → first request consumes the budget,
      // the second is rejected at the limiter regardless of the body shape.
      const first = await app.inject({
        method: 'POST',
        url: '/internal/v1/tenants',
        remoteAddress,
        payload: {},
      });
      expect(first.statusCode).not.toBe(429);
      const limited = await app.inject({
        method: 'POST',
        url: '/internal/v1/tenants',
        remoteAddress,
        payload: {},
      });
      expect(limited.statusCode).toBe(429);
      expect(limited.headers['content-type']).toContain('application/problem+json');
    });

    it('a rotating session cookie cannot mint fresh sign-in buckets', async () => {
      const remoteAddress = '10.20.30.43';
      const attempt = (n: number) =>
        app.inject({
          method: 'POST',
          url: '/api/auth/sign-in/email',
          remoteAddress,
          headers: { cookie: `better-auth.session_token=rotating-value-${String(n)}` },
          payload: { email: `probe-${String(n)}@example.com`, password: 'wrong-password' },
        });

      let limitedAt = -1;
      for (let n = 0; n < 12; n += 1) {
        const res = await attempt(n);
        if (res.statusCode === 429) {
          limitedAt = n;
          break;
        }
      }

      expect(limitedAt).toBeGreaterThanOrEqual(0);
      expect(limitedAt).toBeLessThanOrEqual(10);
    });

    it('keeps /healthz exempted via allowList', async () => {
      for (let i = 0; i < 10; i += 1) {
        const res = await app.inject({ method: 'GET', url: '/healthz' });
        expect(res.statusCode).toBe(200);
      }
    });
  });
});
