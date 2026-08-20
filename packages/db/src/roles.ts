import { readFileSync } from 'node:fs';
import type { Sql } from 'postgres';
import { validateRolePassword } from './internal/password';
import { assertRoleAttributes } from './preflight';

// Read at call time, not import time: `provisionAppRole`/`provisionAuthRole` are
// provisioning entry points that only CLI scripts invoke, and `@resto/db`'s index
// re-exports them into `apps/api`'s bundle. A top-level `import ... from '*.sql'`
// resolves under esbuild but throws ERR_UNKNOWN_FILE_EXTENSION under tsx/Node ESM,
// which silently broke `provision-roles-ci` and `db:audit-fks` (10.2-FINDINGS F-15).
const readGrantsSql = (): string =>
  readFileSync(new URL('../sql/roles.sql', import.meta.url), 'utf8');

/**
 * Provision the `resto_app` runtime role on the connected database.
 *
 * Caller must connect as a role with privileges to `CREATE ROLE` / `GRANT`
 * — typically the bootstrap superuser (dev) or `resto_admin` (production).
 * Idempotent: safe to re-run; password is updated to whatever is supplied.
 *
 * Password handling (RES-245):
 *   1. `validateRolePassword` enforces a strict whitelist
 *      (`[A-Za-z0-9!@#$%^&*()_+\-=]{16,128}`, no `--` or `/*`). Single
 *      quotes, backslashes, semicolons, whitespace, and control chars
 *      are all rejected.
 *   2. The validated password is then wrapped in a Postgres string
 *      literal (`'...'`) inside the SQL we send. Postgres DDL
 *      (`CREATE/ALTER ROLE`) does NOT accept bind parameters, so
 *      parameterization via the wire protocol is structurally
 *      impossible for this statement; the whitelist exists precisely so
 *      that in-band literal quoting is provably safe (no quote, no
 *      backslash, no escape sequence inside the literal).
 *
 * `assertRoleAttributes` verifies the resulting role has no
 * SUPERUSER / BYPASSRLS / CREATEROLE / CREATEDB attributes.
 */
export const provisionAppRole = async (
  client: Sql,
  options: { appPassword: string },
): Promise<void> => {
  validateRolePassword('provisionAppRole', options.appPassword);

  const rows = await client<{ exists: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') AS exists
  `;
  // Safe because validateRolePassword guarantees the password contains
  // no single quote, backslash, or other escape character — wrapping in
  // single quotes cannot terminate the literal early or smuggle a
  // statement. See RES-245 spec.
  const pwdLiteral = `'${options.appPassword}'`;
  if (rows[0]?.exists) {
    await client.unsafe(
      `ALTER ROLE resto_app WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD ${pwdLiteral}`,
    );
  } else {
    await client.unsafe(
      `CREATE ROLE resto_app WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD ${pwdLiteral}`,
    );
  }

  await client.unsafe(readGrantsSql());

  await assertRoleAttributes(client, 'resto_app', {
    rolsuper: false,
    rolbypassrls: false,
    rolcreaterole: false,
    rolcreatedb: false,
  });
};

/**
 * Resolved name of the runtime role provisioned by `provisionAppRole`.
 * Exported so callers (tests, runbook tooling) can build a connection
 * URL without hard-coding the literal in a second place.
 */
export const RESTO_APP_ROLE = 'resto_app';
