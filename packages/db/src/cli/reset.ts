import postgres from 'postgres';
import { logger } from '../logger';

/**
 * Drop and recreate the public schema, then re-run migrations. Dev only.
 *
 * Refuses to run when `NODE_ENV` is `production` or `staging`.
 */
const main = async (): Promise<void> => {
  const env = process.env.NODE_ENV ?? 'development';
  if (env === 'production' || env === 'staging') {
    logger.error({ env }, 'db:reset is forbidden outside development.');
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    logger.error('DATABASE_URL is required to reset the dev database.');
    process.exit(1);
  }

  const client = postgres(url, { max: 1, prepare: false });

  try {
    logger.warn('Dropping public schema and recreating…');
    await client.unsafe('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    logger.info('Schema reset complete. Run `pnpm db:migrate` next.');
  } finally {
    await client.end({ timeout: 5 });
  }
};

main().catch((err: unknown) => {
  logger.error({ err }, 'Reset failed.');
  process.exit(1);
});
