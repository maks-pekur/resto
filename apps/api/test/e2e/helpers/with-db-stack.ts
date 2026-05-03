import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { provisionAppRole, RESTO_APP_ROLE, TenantAwareDb } from '@resto/db';

const DB_MIGRATIONS_FOLDER = resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'packages',
  'db',
  'migrations',
);
const APP_ROLE_PASSWORD = 'resto_app';

export interface DbStack {
  readonly pg: StartedPostgreSqlContainer;
  readonly db: TenantAwareDb;
  readonly adminUrl: string;
  readonly appUrl: string;
}

/**
 * Pattern B (db-only) e2e harness.
 *
 * Boots a Postgres container, runs migrations, provisions the runtime
 * `resto_app` role, and returns a `TenantAwareDb` connected as that role.
 * No NATS, no NestJS — use this for tests that exercise schema, RLS, or
 * role-grant behaviour and do not need the HTTP surface.
 *
 * Mirrors `with-real-stack.setup.ts` so future drift is easy to spot.
 */
export const startDbStack = async (): Promise<DbStack> => {
  const pg = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('resto_e2e_db')
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
  const appUrl = url.toString();

  const db = new TenantAwareDb({ url: appUrl });
  return { pg, db, adminUrl, appUrl };
};

export const stopDbStack = async (stack: DbStack): Promise<void> => {
  await stack.db.close();
  await stack.pg.stop({ timeout: 5_000 });
};

export const isDockerAvailable = (): boolean => {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
