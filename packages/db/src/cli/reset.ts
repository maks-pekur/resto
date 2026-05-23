import postgres from 'postgres';
import { logger } from '../logger';
import {
  assertConfirmationProvided,
  assertHostAllowed,
  assertNodeEnvAllowed,
  CONFIRMATION_VAR,
  ResetGuardError,
} from './reset-guards';

/**
 * Drop and recreate the `public` schema, then re-run migrations. Dev only.
 *
 * Three layers of defense via `cli/reset-guards.ts` (testable without
 * mocking `process.exit`):
 *   1. `NODE_ENV` must be `development` or `test` (allowlist).
 *   2. `RESTO_CONFIRM_RESET=yes-wipe-my-dev-db` literal value required.
 *   3. `DATABASE_ADMIN_URL` host must be in {localhost, 127.0.0.1, postgres}.
 *
 * No fallback to `DATABASE_URL` — operators must explicitly point at the
 * admin URL.
 */
const main = async (): Promise<void> => {
  assertNodeEnvAllowed(process.env.NODE_ENV);
  assertConfirmationProvided(process.env[CONFIRMATION_VAR]);

  const url = process.env.DATABASE_ADMIN_URL;
  assertHostAllowed(url);
  // After assertHostAllowed, `url` is narrowed to `string` via the
  // function's `asserts url is string` signature — no cast needed.
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
  if (err instanceof ResetGuardError) {
    // Guard failures get a clean one-line error; full stack trace would
    // bury the actionable message.
    logger.error(err.message);
  } else {
    logger.error({ err }, 'Reset failed.');
  }
  process.exit(1);
});
