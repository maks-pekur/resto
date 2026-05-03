import 'reflect-metadata';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
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

export interface StartRealStackOptions {
  /**
   * NATS subscriber wiring inside the api process. Set `false` to keep
   * the broker container alive (so a test-side subscriber can connect)
   * but stop the api from also publishing/subscribing — used by suites
   * that exercise non-event paths and do not want stray dispatcher
   * activity.
   *
   * Default: `true` (the api connects to NATS). The broker container is
   * always started so the harness shape stays uniform.
   */
  readonly natsEnabledInApp?: boolean;
  /**
   * Hook to override providers in the testing module — same signature
   * as `TestingModuleBuilder.overrideProvider(...).useValue(...)`. Each
   * entry runs before `.compile()`. Used by suites that need to swap a
   * port (e.g. `IMAGE_URL_PORT` to a deterministic stub).
   */
  readonly overrideProviders?: readonly {
    readonly provide: unknown;
    readonly useValue: unknown;
  }[];
}

export const startRealStack = async (options: StartRealStackOptions = {}): Promise<RealStack> => {
  const [{ container: pg, appUrl }, { container: nats, url: natsUrl }] = await Promise.all([
    startPostgres(),
    startNats(),
  ]);

  process.env.NODE_ENV = 'test';
  process.env.OTEL_DISABLED = 'true';
  process.env.NATS_DISABLED = options.natsEnabledInApp === false ? 'true' : 'false';
  process.env.DATABASE_URL = appUrl;
  process.env.NATS_URL = natsUrl;
  process.env.NATS_STREAM = 'RESTO_EVENTS_E2E';
  process.env.INTERNAL_API_TOKEN = 'integration-test-token-1234567890';

  let builder: TestingModuleBuilder = Test.createTestingModule({ imports: [AppModule] });
  for (const override of options.overrideProviders ?? []) {
    builder = builder.overrideProvider(override.provide).useValue(override.useValue);
  }
  const moduleRef = await builder.compile();
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
