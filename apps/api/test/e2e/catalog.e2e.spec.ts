import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { provisionAppRole, RESTO_APP_ROLE } from '@resto/db';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { AppModule } from '../../src/app.module';
import { IMAGE_URL_PORT } from '../../src/contexts/catalog/domain/ports';
import { JWT_VERIFIER } from '../../src/contexts/identity/domain/ports';
import type { Principal } from '../../src/contexts/identity/domain/principal';

const dockerOk = ((): boolean => {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const suite = dockerOk ? describe : describe.skip;

const DB_MIGRATIONS_FOLDER = resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'db',
  'migrations',
);
const APP_ROLE_PASSWORD = 'resto_app';
const INTERNAL_TOKEN = 'integration-test-token-1234567890';

interface Stack {
  pg: StartedPostgreSqlContainer;
  nats: StartedTestContainer;
  app: NestFastifyApplication;
  principalRef: { current: Principal | null };
}

const startStack = async (): Promise<Stack> => {
  const pg = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('resto_e2e')
    .withUsername('resto_admin')
    .withPassword('resto_admin')
    .start();
  const adminUrl = pg.getConnectionUri();
  const adminClient = postgres(adminUrl, { max: 1, prepare: false });
  try {
    await migrate(drizzle(adminClient), { migrationsFolder: DB_MIGRATIONS_FOLDER });
    await provisionAppRole(adminClient, { appPassword: APP_ROLE_PASSWORD });
  } finally {
    await adminClient.end({ timeout: 5 });
  }
  const url = new URL(adminUrl);
  url.username = RESTO_APP_ROLE;
  url.password = APP_ROLE_PASSWORD;

  const nats = await new GenericContainer('nats:2.10-alpine')
    .withCommand(['--jetstream'])
    .withExposedPorts(4222)
    .withWaitStrategy(Wait.forLogMessage(/Server is ready/))
    .start();

  process.env.NODE_ENV = 'test';
  process.env.OTEL_DISABLED = 'true';
  process.env.NATS_DISABLED = 'true';
  process.env.DATABASE_URL = url.toString();
  process.env.NATS_URL = `nats://${nats.getHost()}:${nats.getMappedPort(4222).toString()}`;
  process.env.INTERNAL_API_TOKEN = INTERNAL_TOKEN;
  delete process.env.REDIS_URL;
  delete process.env.KEYCLOAK_ISSUER_URL;

  const principalRef: { current: Principal | null } = { current: null };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JWT_VERIFIER)
    .useValue({
      verify: (_token: string): Promise<Principal> => {
        if (!principalRef.current) {
          return Promise.reject(new Error('test JWT verifier: principal not set'));
        }
        return Promise.resolve(principalRef.current);
      },
    })
    // Don't reach for MinIO in tests — produce a deterministic signed URL
    // shape so the assertion stays focused on "raw key never leaks".
    .overrideProvider(IMAGE_URL_PORT)
    .useValue({
      presignGet: (key: string, ttl: number): Promise<string> =>
        Promise.resolve(`https://signed.test/${key}?expires=${ttl.toString()}`),
    })
    .compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ logger: false }),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { pg, nats, app, principalRef };
};

const stopStack = async (stack: Stack): Promise<void> => {
  await stack.app.close();
  await Promise.all([stack.pg.stop({ timeout: 5_000 }), stack.nats.stop({ timeout: 5_000 })]);
};

const provisionTenant = async (
  app: NestFastifyApplication,
  body: { slug: string; displayName: string },
): Promise<{ id: string; primaryDomain: string }> => {
  const res = await app.inject({
    method: 'POST',
    url: '/internal/v1/tenants',
    headers: { 'x-internal-token': INTERNAL_TOKEN },
    payload: { ...body, defaultCurrency: 'USD', locale: 'en' },
  });
  if (res.statusCode !== 201) {
    throw new Error(`provisionTenant failed: ${res.statusCode.toString()} ${res.body}`);
  }
  return res.json();
};

suite('Catalog — internal write → public read → cross-tenant isolation', () => {
  let stack: Stack;
  let tenantA: { id: string };

  beforeAll(async () => {
    stack = await startStack();
    tenantA = await provisionTenant(stack.app, { slug: 'cafe-a', displayName: 'Cafe A' });
    // Tenant B exists so the cross-tenant test has a host to send requests against.
    await provisionTenant(stack.app, { slug: 'cafe-b', displayName: 'Cafe B' });
  }, 180_000);

  afterAll(async () => {
    await stopStack(stack);
  });

  it('owner can upsert a category, item, then publish, and the public menu surfaces the item', async () => {
    stack.principalRef.current = {
      subject: 'kc-test',
      tenantId: tenantA.id,
      roles: ['owner'],
    };

    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: { authorization: 'Bearer fake', 'x-tenant-slug': 'cafe-a' },
      payload: { slug: 'pizza', name: { en: 'Pizza' }, sortOrder: 0 },
    });
    expect(categoryRes.statusCode).toBe(200);
    const categoryId = categoryRes.json<{ id: string }>().id;

    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/items',
      headers: { authorization: 'Bearer fake', 'x-tenant-slug': 'cafe-a' },
      payload: {
        categoryId,
        slug: 'margherita',
        name: { en: 'Margherita' },
        basePrice: '12.50',
        currency: 'USD',
        imageS3Key: 'menu/margherita.webp',
        status: 'published',
      },
    });
    expect(itemRes.statusCode).toBe(200);
    const itemId = itemRes.json<{ id: string }>().id;

    const publishRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/publish',
      headers: { authorization: 'Bearer fake', 'x-tenant-slug': 'cafe-a' },
    });
    expect(publishRes.statusCode).toBe(200);

    const menuRes = await stack.app.inject({
      method: 'GET',
      url: '/v1/menu',
      headers: { 'x-tenant-slug': 'cafe-a' },
    });
    expect(menuRes.statusCode).toBe(200);
    const menu = menuRes.json<{
      items: { id: string; slug: string; imageUrl: string | null }[];
    }>();
    const item = menu.items.find((i) => i.id === itemId);
    expect(item?.slug).toBe('margherita');
    // RES-92: raw S3 key never crosses the wire; the response carries
    // a presigned URL instead.
    expect(item?.imageUrl).toBe('https://signed.test/menu/margherita.webp?expires=300');
    expect(JSON.stringify(menu)).not.toContain('imageS3Key');
  }, 60_000);

  it("tenant B sniffing tenant A's item id gets 404 (RLS-backed)", async () => {
    // Provision an item under tenant A.
    stack.principalRef.current = {
      subject: 'kc-test',
      tenantId: tenantA.id,
      roles: ['owner'],
    };
    const categoryRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/categories',
      headers: { authorization: 'Bearer fake', 'x-tenant-slug': 'cafe-a' },
      payload: { slug: 'drinks', name: { en: 'Drinks' } },
    });
    const categoryId = categoryRes.json<{ id: string }>().id;
    const itemRes = await stack.app.inject({
      method: 'POST',
      url: '/internal/v1/catalog/items',
      headers: { authorization: 'Bearer fake', 'x-tenant-slug': 'cafe-a' },
      payload: {
        categoryId,
        slug: 'cola',
        name: { en: 'Cola' },
        basePrice: '3.00',
        currency: 'USD',
        status: 'published',
      },
    });
    const tenantAItemId = itemRes.json<{ id: string }>().id;

    // Now request the same id from tenant B's host. RLS should return 404.
    const sniff = await stack.app.inject({
      method: 'GET',
      url: `/v1/menu/items/${tenantAItemId}`,
      headers: { 'x-tenant-slug': 'cafe-b' },
    });
    expect(sniff.statusCode).toBe(404);
  }, 60_000);
});
