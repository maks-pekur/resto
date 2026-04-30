import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { logger } from '../logger';

/**
 * Apply all pending migrations against `DATABASE_URL`.
 *
 * Migrations are forward-only (per ADR-0003); rollbacks are implemented
 * as paired forward migrations.
 *
 * Run via `pnpm db:migrate` — never inline at app startup.
 */
const main = async (): Promise<void> => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    logger.error('DATABASE_URL is required to run migrations.');
    process.exit(1);
  }

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);

  try {
    logger.info({ url: redactUrl(url) }, 'Applying migrations…');
    await migrate(db, { migrationsFolder: './migrations' });
    logger.info('Migrations applied.');
  } finally {
    await client.end({ timeout: 5 });
  }
};

const redactUrl = (raw: string): string => {
  try {
    const parsed = new URL(raw);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '***';
  }
};

main().catch((err: unknown) => {
  logger.error({ err }, 'Migration failed.');
  process.exit(1);
});
