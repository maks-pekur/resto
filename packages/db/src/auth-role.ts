import type { Sql } from 'postgres';
// G-01: inlined at build time by esbuild `loader: { '.sql': 'text' }`;
// eliminates the import.meta.dirname runtime path read that crashes the
// CJS bundle (import_meta.dirname = undefined in bundled output).
import GRANTS_SQL from '../sql/auth-role.sql';
import { validateRolePassword } from './internal/password';
import { assertRoleAttributes } from './preflight';

/**
 * Provision the `resto_auth` BYPASSRLS role for Better Auth's drizzle
 * client. Mirrors `provisionAppRole` but with BYPASSRLS. Caller must be
 * connected as a role with CREATE ROLE / GRANT privileges (bootstrap
 * superuser in dev; resto_admin in prod).
 *
 * Idempotent. Password handling (RES-245):
 *   1. `validateRolePassword` enforces a strict whitelist
 *      (`[A-Za-z0-9!@#$%^&*()_+\-=]{16,128}`, no `--` or `/*`).
 *   2. The validated password is wrapped in a Postgres string literal
 *      (`'...'`) inside the SQL we send. Postgres DDL does NOT accept
 *      bind parameters for `CREATE/ALTER ROLE PASSWORD`; the whitelist
 *      exists so that in-band literal quoting is provably safe (no
 *      quote, no backslash, no escape sequence inside the literal).
 *
 * `assertRoleAttributes` verifies the resulting role has BYPASSRLS but
 * no SUPERUSER / CREATEROLE / CREATEDB attributes.
 */
export const provisionAuthRole = async (
  client: Sql,
  options: { authPassword: string },
): Promise<void> => {
  validateRolePassword('provisionAuthRole', options.authPassword);

  const rows = await client<{ exists: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'resto_auth') AS exists
  `;
  // Safe because validateRolePassword guarantees the password contains
  // no single quote, backslash, or other escape character — wrapping in
  // single quotes cannot terminate the literal early or smuggle a
  // statement. See RES-245 spec.
  const pwdLiteral = `'${options.authPassword}'`;
  if (rows[0]?.exists) {
    await client.unsafe(
      `ALTER ROLE resto_auth WITH LOGIN NOSUPERUSER BYPASSRLS PASSWORD ${pwdLiteral}`,
    );
  } else {
    await client.unsafe(
      `CREATE ROLE resto_auth WITH LOGIN NOSUPERUSER BYPASSRLS PASSWORD ${pwdLiteral}`,
    );
  }

  await client.unsafe(GRANTS_SQL);

  await assertRoleAttributes(client, 'resto_auth', {
    rolsuper: false,
    rolbypassrls: true,
    rolcreaterole: false,
    rolcreatedb: false,
  });
};

/**
 * Resolved name of the BYPASSRLS role provisioned by `provisionAuthRole`.
 * Exported so callers (tests, runbook tooling) can build a connection URL
 * without hard-coding the literal in a second place.
 */
export const RESTO_AUTH_ROLE = 'resto_auth';
