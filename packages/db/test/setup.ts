import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { createDb, provisionAppRole, RESTO_APP_ROLE, type TenantAwareDb } from '../src/index';

export interface TestPg {
  readonly container: StartedPostgreSqlContainer;
  /**
   * Connection URL for the bootstrap superuser. Use this from tests that
   * specifically need to exercise the "wrong credentials" path.
   */
  readonly adminUrl: string;
  /**
   * Connection URL for the runtime `resto_app` role. This is what the
   * application would use in production — non-superuser, NOBYPASSRLS.
   */
  readonly url: string;
  readonly db: TenantAwareDb;
}

const MIGRATIONS_FOLDER = resolve(import.meta.dirname, '..', 'migrations');
const APP_ROLE_PASSWORD = 'resto_app';

/**
 * Start a fresh Postgres 16 container, apply all migrations, provision
 * the runtime `resto_app` role via the canonical `roles.sql`, and return
 * a tenant-aware client connected through that role. Connecting through
 * a NOBYPASSRLS role is the only way to actually exercise RLS — Postgres
 * superusers bypass RLS regardless of `FORCE`.
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

  const adminClient = postgres(adminUrl, { max: 1, prepare: false });
  try {
    await migrate(drizzle(adminClient), { migrationsFolder: MIGRATIONS_FOLDER });
    await provisionAppRole(adminClient, { appPassword: APP_ROLE_PASSWORD });
  } finally {
    await adminClient.end({ timeout: 5 });
  }

  const appUrl = new URL(adminUrl);
  appUrl.username = RESTO_APP_ROLE;
  appUrl.password = APP_ROLE_PASSWORD;
  const url = appUrl.toString();

  const db = createDb({ url });
  return { container, adminUrl, url, db };
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
