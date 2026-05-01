import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { logger } from '../logger';

/**
 * Apply all pending migrations.
 *
 * Connects as the schema-owning admin role: prefers `DATABASE_ADMIN_URL`
 * and falls back to `DATABASE_URL` with a warning. Production deployments
 * should always set `DATABASE_ADMIN_URL` separately so the runtime app
 * never sees admin credentials.
 *
 * Migrations are forward-only (per ADR-0003); rollbacks are implemented
 * as paired forward migrations. Run via `pnpm db:migrate` — never inline
 * at app startup.
 */
const main = async (): Promise<void> => {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  const fallbackUrl = process.env.DATABASE_URL;
  const url = adminUrl ?? fallbackUrl;
  if (!url) {
    logger.error('DATABASE_ADMIN_URL (preferred) or DATABASE_URL is required to run migrations.');
    process.exit(1);
  }
  if (!adminUrl) {
    logger.warn(
      'DATABASE_ADMIN_URL not set — falling back to DATABASE_URL for migrations. ' +
        'In production these MUST be separate credentials (admin runs migrations, app role at runtime).',
    );
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
