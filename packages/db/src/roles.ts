import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Sql } from 'postgres';

const ROLES_SQL_PATH = resolve(import.meta.dirname, '..', 'sql', 'roles.sql');
const PASSWORD_PLACEHOLDER = '__APP_PASSWORD__';

/**
 * Postgres SQL identifiers/passwords cannot legally contain a single
 * quote in this provisioning script — the canonical roles.sql wraps the
 * password in `'...'`. Reject early with a clear error rather than
 * letting a malformed quote silently corrupt the SQL we send to the
 * server.
 */
const validateAppPassword = (appPassword: string): void => {
  if (appPassword.length === 0) {
    throw new Error('provisionAppRole: appPassword must be non-empty.');
  }
  if (appPassword.includes("'")) {
    throw new Error("provisionAppRole: appPassword must not contain a single quote (').");
  }
};

/**
 * Provision the `resto_app` runtime role on the connected database.
 *
 * Caller must connect as a role with privileges to `CREATE ROLE` / `GRANT`
 * — typically the bootstrap superuser (dev) or `resto_admin` (production).
 * Idempotent: safe to re-run; password is updated to whatever is supplied.
 *
 * Used by the test container setup and by operator scripts. The dev docker
 * stack ships an equivalent `02-app-role.sql` so the role exists the
 * first time the postgres volume is created.
 */
export const provisionAppRole = async (
  client: Sql,
  options: { appPassword: string },
): Promise<void> => {
  validateAppPassword(options.appPassword);
  const sqlText = readFileSync(ROLES_SQL_PATH, 'utf8').replaceAll(
    PASSWORD_PLACEHOLDER,
    options.appPassword,
  );
  await client.unsafe(sqlText);
};

/**
 * Resolved name of the runtime role provisioned by `roles.sql`. Exported
 * so callers (tests, runbook tooling) can build a connection URL without
 * hard-coding the literal in a second place.
 */
export const RESTO_APP_ROLE = 'resto_app';
