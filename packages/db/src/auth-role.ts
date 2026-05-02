import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Sql } from 'postgres';

const AUTH_ROLE_SQL_PATH = resolve(import.meta.dirname, '..', 'sql', 'auth-role.sql');
const PASSWORD_PLACEHOLDER = '__AUTH_PASSWORD__';

/**
 * Postgres SQL identifiers/passwords cannot legally contain a single
 * quote in this provisioning script — the canonical auth-role.sql wraps
 * the password in `'...'`. Reject early with a clear error rather than
 * letting a malformed quote silently corrupt the SQL we send to the
 * server.
 */
const validatePassword = (pwd: string): void => {
  if (pwd.length === 0) throw new Error('provisionAuthRole: authPassword must be non-empty.');
  if (pwd.includes("'")) {
    throw new Error("provisionAuthRole: authPassword must not contain a single quote (').");
  }
};

/**
 * Provision the `resto_auth` BYPASSRLS role for Better Auth's drizzle
 * client. Mirrors `provisionAppRole` but with BYPASSRLS. Caller must be
 * connected as a role with CREATE ROLE / GRANT privileges (bootstrap
 * superuser in dev; resto_admin in prod).
 *
 * Idempotent. Used by the test container setup and operator scripts.
 */
export const provisionAuthRole = async (
  client: Sql,
  options: { authPassword: string },
): Promise<void> => {
  validatePassword(options.authPassword);
  const sqlText = readFileSync(AUTH_ROLE_SQL_PATH, 'utf8').replaceAll(
    PASSWORD_PLACEHOLDER,
    options.authPassword,
  );
  await client.unsafe(sqlText);
};

/**
 * Resolved name of the BYPASSRLS role provisioned by `auth-role.sql`.
 * Exported so callers (tests, runbook tooling) can build a connection URL
 * without hard-coding the literal in a second place.
 */
export const RESTO_AUTH_ROLE = 'resto_auth';
