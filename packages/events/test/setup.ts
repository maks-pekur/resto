import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { createDb, provisionAppRole, RESTO_APP_ROLE, type TenantAwareDb } from '@resto/db';
import { NatsJetStreamPublisher, NatsJetStreamSubscriber } from '../src/index';

const DB_MIGRATIONS_FOLDER = resolve(import.meta.dirname, '..', '..', 'db', 'migrations');
const APP_ROLE_PASSWORD = 'resto_app';
const NATS_STREAM = 'RESTO_EVENTS_TEST';

export interface TestEnv {
  readonly pg: StartedPostgreSqlContainer;
  readonly nats: StartedTestContainer;
  readonly db: TenantAwareDb;
  readonly publisher: NatsJetStreamPublisher;
  readonly subscriber: NatsJetStreamSubscriber;
  readonly natsUrl: string;
  readonly stream: string;
}

const startPostgres = async (): Promise<{
  container: StartedPostgreSqlContainer;
  appUrl: string;
}> => {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('resto_events_test')
    .withUsername('resto_test')
    .withPassword('resto_test')
    .start();
  const adminUrl = container.getConnectionUri();

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

export const startTestEnv = async (): Promise<TestEnv> => {
  const [{ container: pg, appUrl }, { container: nats, url: natsUrl }] = await Promise.all([
    startPostgres(),
    startNats(),
  ]);

  const db = createDb({ url: appUrl });
  const publisher = await NatsJetStreamPublisher.connect({
    servers: natsUrl,
    stream: NATS_STREAM,
    // Per-context subject prefixes — JetStream rejects a top-level `>`
    // catch-all stream unless `no_ack: true`, which would disable
    // PubAck and break the dispatcher's delivery confirmation.
    subjects: ['tenancy.>', 'catalog.>', 'ordering.>', 'identity.>', 'demo.>'],
  });
  const subscriber = await NatsJetStreamSubscriber.connect({
    servers: natsUrl,
    stream: NATS_STREAM,
  });

  return { pg, nats, db, publisher, subscriber, natsUrl, stream: NATS_STREAM };
};

export const stopTestEnv = async (env: TestEnv): Promise<void> => {
  await env.subscriber.close().catch(() => undefined);
  await env.publisher.close().catch(() => undefined);
  await env.db.close();
  await Promise.all([env.pg.stop({ timeout: 5_000 }), env.nats.stop({ timeout: 5_000 })]);
};

export const isDockerAvailable = (): boolean => {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
