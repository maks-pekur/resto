import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { TenantAwareDb } from '@resto/db';
import { AppModule } from '../../src/app.module';

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

const setRequiredEnv = (): void => {
  process.env.DATABASE_URL = 'postgres://app@localhost:5432/resto';
  process.env.NATS_URL = 'nats://localhost:4222';
  process.env.NODE_ENV = 'test';
  process.env.OTEL_DISABLED = 'true';
  process.env.NATS_DISABLED = 'true';
};

describe('GET /healthz', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    setRequiredEnv();
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TenantAwareDb)
      .useValue(buildDbStub())
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('echoes the X-Correlation-Id header from the request', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-correlation-id': '11111111-1111-4111-8111-111111111111' },
    });
    expect(res.headers['x-correlation-id']).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('generates a fresh correlation id when the request omits one', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.headers['x-correlation-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
