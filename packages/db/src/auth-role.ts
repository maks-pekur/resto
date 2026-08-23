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
  readFileSync(new URL('../sql/auth-role.sql', import.meta.url), 'utf8');

/**
 * Provision the `resto_auth` NOBYPASSRLS role for Better Auth's drizzle
 * client. Mirrors `provisionAppRole` exactly (NOSUPERUSER NOBYPASSRLS).
 * resto_auth reaches the four RLS-enabled BA-owned tables it operates on
 * (member, invitation, tenant_role, tenants) via explicit permissive
 * RLS policies created by migration 0054 (Option A, D-04 / RDS). This
 * removes the dependency on the BYPASSRLS attribute, which AWS RDS cannot
 * confer on a non-superuser (rds_superuser is not a true SUPERUSER).
 *
 * Caller must be connected as a role with CREATE ROLE / GRANT privileges
 * (bootstrap superuser in dev; resto_admin in prod).
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
 * `assertRoleAttributes` verifies the resulting role has NOBYPASSRLS and
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
    // NOBYPASSRLS strips a pre-existing BYPASSRLS attribute from any DB
    // provisioned before migration 0054 / plan 07.5-05 (D-04 / RDS fix).
    await client.unsafe(
      `ALTER ROLE resto_auth WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD ${pwdLiteral}`,
    );
  } else {
    await client.unsafe(
      `CREATE ROLE resto_auth WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD ${pwdLiteral}`,
    );
  }

  await client.unsafe(readGrantsSql());

  await assertRoleAttributes(client, 'resto_auth', {
    rolsuper: false,
    rolbypassrls: false,
    rolcreaterole: false,
    rolcreatedb: false,
  });
};

/**
 * Resolved name of the NOBYPASSRLS role provisioned by `provisionAuthRole`.
 * Exported so callers (tests, runbook tooling) can build a connection URL
 * without hard-coding the literal in a second place.
 */
export const RESTO_AUTH_ROLE = 'resto_auth';
