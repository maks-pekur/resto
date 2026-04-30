import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { createDb, type TenantAwareDb } from '../src/index';

export interface TestPg {
  readonly container: StartedPostgreSqlContainer;
  readonly url: string;
  readonly db: TenantAwareDb;
}

const MIGRATIONS_FOLDER = resolve(import.meta.dirname, '..', 'migrations');

/**
 * Start a fresh Postgres 16 container, apply all migrations (schema +
 * RLS), and return a tenant-aware client wired to it.
 *
 * Each test file calls this in `beforeAll` and tears down in `afterAll`.
 * Container start is the slow step (~5-8s); reuse across tests in a file.
 */
export const startPostgres = async (): Promise<TestPg> => {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('resto_test')
    .withUsername('resto_test')
    .withPassword('resto_test')
    .withReuse()
    .start();

  const url = container.getConnectionUri();
  const migrationClient = postgres(url, { max: 1, prepare: false });
  try {
    await migrate(drizzle(migrationClient), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await migrationClient.end({ timeout: 5 });
  }

  const db = createDb({ url });
  return { container, url, db };
};

export const stopPostgres = async (tp: TestPg): Promise<void> => {
  await tp.db.close();
  await tp.container.stop({ timeout: 5_000 });
};

/**
 * Cheap up-front check: integration tests require a running Docker
 * daemon. Skip the suite cleanly when it is not available.
 */
export const isDockerAvailable = (): boolean => {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
