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
 * RLS), drop superuser from the test role so RLS is actually enforced
 * (Postgres superusers bypass RLS regardless of FORCE), and return a
 * tenant-aware client wired to it.
 *
 * Each test file calls this in `beforeAll` and tears down in `afterAll`.
 * Container start is the slow step (~5-8s).
 */
export const startPostgres = async (): Promise<TestPg> => {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('resto_test')
    .withUsername('resto_test')
    .withPassword('resto_test')
    .start();

  const adminUrl = container.getConnectionUri();

  // Migrate as the bootstrap superuser. Then create a non-superuser app
  // role and grant it the privileges the TenantAwareDb needs. Connecting
  // through that role is the only way to actually exercise RLS — Postgres
  // superusers bypass RLS regardless of FORCE.
  const migrationClient = postgres(adminUrl, { max: 1, prepare: false });
  try {
    await migrate(drizzle(migrationClient), { migrationsFolder: MIGRATIONS_FOLDER });
    await migrationClient.unsafe(`
      CREATE ROLE resto_app LOGIN PASSWORD 'resto_app' NOSUPERUSER NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public TO resto_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO resto_app;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO resto_app;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO resto_app;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO resto_app;
    `);
  } finally {
    await migrationClient.end({ timeout: 5 });
  }

  const appUrl = new URL(adminUrl);
  appUrl.username = 'resto_app';
  appUrl.password = 'resto_app';
  const db = createDb({ url: appUrl.toString() });
  return { container, url: appUrl.toString(), db };
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
