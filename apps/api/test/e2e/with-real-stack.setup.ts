import 'reflect-metadata';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { provisionAppRole, RESTO_APP_ROLE } from '@resto/db';
import { AppModule } from '../../src/app.module';

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

export interface RealStack {
  readonly pg: StartedPostgreSqlContainer;
  readonly nats: StartedTestContainer;
  readonly app: NestFastifyApplication;
  readonly databaseUrl: string;
  readonly natsUrl: string;
}

const startPostgres = async (): Promise<{
  container: StartedPostgreSqlContainer;
  appUrl: string;
}> => {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('resto_e2e')
    .withUsername('resto_admin')
    .withPassword('resto_admin')
    .start();
  const adminUrl = container.getConnectionUri();

  const client = postgres(adminUrl, { max: 1, prepare: false });
  try {
    await migrate(drizzle(client), { migrationsFolder: DB_MIGRATIONS_FOLDER });
    await provisionAppRole(client, { appPassword: APP_ROLE_PASSWORD });
  } finally {
    await client.end({ timeout: 5 });
  }

  const url = new URL(adminUrl);
  url.username = RESTO_APP_ROLE;
  url.password = APP_ROLE_PASSWORD;
  return { container, appUrl: url.toString() };
};

const startNats = async (): Promise<{ container: StartedTestContainer; url: string }> => {
  const container = await new GenericContainer('nats:2.10-alpine')
    .withCommand(['--jetstream'])
    .withExposedPorts(4222)
    .withWaitStrategy(Wait.forLogMessage(/Server is ready/))
    .start();
  const url = `nats://${container.getHost()}:${container.getMappedPort(4222).toString()}`;
  return { container, url };
};

export const startRealStack = async (): Promise<RealStack> => {
  const [{ container: pg, appUrl }, { container: nats, url: natsUrl }] = await Promise.all([
    startPostgres(),
    startNats(),
  ]);

  process.env.NODE_ENV = 'test';
  process.env.OTEL_DISABLED = 'true';
  process.env.NATS_DISABLED = 'false';
  process.env.DATABASE_URL = appUrl;
  process.env.NATS_URL = natsUrl;
  process.env.NATS_STREAM = 'RESTO_EVENTS_E2E';
  process.env.INTERNAL_API_TOKEN = 'integration-test-token-1234567890';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ logger: false }),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return { pg, nats, app, databaseUrl: appUrl, natsUrl };
};

export const stopRealStack = async (stack: RealStack): Promise<void> => {
  await stack.app.close();
  await Promise.all([stack.pg.stop({ timeout: 5_000 }), stack.nats.stop({ timeout: 5_000 })]);
};

export const isDockerAvailable = (): boolean => {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
