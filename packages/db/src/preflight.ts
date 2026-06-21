import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres, { type Sql } from 'postgres';
import { logger } from './logger';
import { WITHOUT_TENANT_ALLOWLIST } from './withoutTenant.allowlist';

/**
 * Error raised when a connection's authenticated role can bypass RLS.
 * Distinct subclass so callers (api bootstrap) can recognise it and emit
 * a clear "you wired the wrong credentials" message rather than a generic
 * startup failure.
 */
export class RlsBypassError extends Error {
  constructor(
    public readonly role: string,
    public readonly attributes: { rolsuper: boolean; rolbypassrls: boolean },
  ) {
    super(
      `Database role "${role}" can bypass row-level security ` +
        `(rolsuper=${attributes.rolsuper.toString()}, rolbypassrls=${attributes.rolbypassrls.toString()}). ` +
        'The application must connect as a NOSUPERUSER NOBYPASSRLS role — see docs/runbooks/database-roles.md.',
    );
    this.name = 'RlsBypassError';
  }
}

interface RoleAttributes {
  readonly rolname: string;
  readonly rolsuper: boolean;
  readonly rolbypassrls: boolean;
}

const queryCurrentRole = async (client: Sql): Promise<RoleAttributes> => {
  const rows = await client<RoleAttributes[]>`
    SELECT rolname, rolsuper, rolbypassrls
    FROM pg_roles
    WHERE rolname = current_user
  `;
  const row = rows[0];
  if (!row) {
    throw new Error('preflight: pg_roles returned no row for current_user.');
  }
  return row;
};

/**
 * Verify that the authenticated role on `url` cannot bypass RLS.
 *
 * Intended to be called once at application boot, before any tenant
 * traffic is served. Fails fast with `RlsBypassError` so operators see
 * the misconfiguration in startup logs rather than discovering it the
 * day a forgotten `WHERE` clause leaks tenant data.
 *
 * The check is a single SELECT against `pg_roles` and finishes in
 * milliseconds. It is not in the request path.
 */
export const assertNoRlsBypass = async (url: string): Promise<void> => {
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });
  try {
    const role = await queryCurrentRole(client);
    if (role.rolsuper || role.rolbypassrls) {
      throw new RlsBypassError(role.rolname, {
        rolsuper: role.rolsuper,
        rolbypassrls: role.rolbypassrls,
      });
    }
    logger.info(
      { role: role.rolname },
      'Database preflight passed: connection role does not bypass RLS.',
    );
  } finally {
    await client.end({ timeout: 5 });
  }
};

/**
 * Error raised when the RES-243 GUC lock is not installed on the
 * connected database. Distinct subclass so the boot path can emit an
 * actionable "run `pnpm db:migrate`" message instead of a generic
 * undefined-function crash on the first request.
 */
export class TenantLockNotInstalledError extends Error {
  constructor(public readonly detail: string) {
    super(
      `RES-243 tenant GUC lock is not installed on the database: ${detail}. ` +
        'Run `pnpm db:migrate` (migrations 0022 + 0023) and verify ' +
        '`roles.sql` has been re-applied for resto_app.',
    );
    this.name = 'TenantLockNotInstalledError';
  }
}

/**
 * Verify that the SECURITY DEFINER wrapper `app_bind_tenant(text,boolean)`
 * exists and the current connection role has EXECUTE on it. Run at boot
 * alongside `assertNoRlsBypass` — if missing, the API refuses to start.
 */
export const assertTenantLockInstalled = async (url: string): Promise<void> => {
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });
  try {
    const fnRows = await client<{ exists: boolean }[]>`
      SELECT to_regprocedure('public.app_bind_tenant(text,boolean)') IS NOT NULL AS exists
    `;
    if (!fnRows[0]?.exists) {
      throw new TenantLockNotInstalledError('app_bind_tenant(text,boolean) is missing');
    }
    const grantRows = await client<{ has_exec: boolean }[]>`
      SELECT has_function_privilege(
        current_user,
        'public.app_bind_tenant(text,boolean)',
        'EXECUTE'
      ) AS has_exec
    `;
    if (!grantRows[0]?.has_exec) {
      throw new TenantLockNotInstalledError(
        'current_user lacks EXECUTE on app_bind_tenant(text,boolean)',
      );
    }
    logger.info('Database preflight passed: app_bind_tenant wrapper installed and executable.');
  } finally {
    await client.end({ timeout: 5 });
  }
};

/**
 * Error raised when `pg_catalog.set_config(text,text,boolean)` is still
 * executable by the connected role — RES-243 expects the PUBLIC grant
 * to have been revoked.
 */
export class SetConfigNotRevokedError extends Error {
  constructor() {
    super(
      'RES-243: pg_catalog.set_config(text,text,boolean) is still ' +
        'executable by the application role. The structural lock against ' +
        'GUC re-bind is bypassed. Re-run `pnpm db:migrate` (migration 0023).',
    );
    this.name = 'SetConfigNotRevokedError';
  }
}

/**
 * Verify that the application role does NOT have EXECUTE on the
 * `set_config(text,text,boolean)` function. Defense A of RES-243.
 */
export const assertSetConfigRevoked = async (url: string): Promise<void> => {
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });
  try {
    const rows = await client<{ has_exec: boolean }[]>`
      SELECT has_function_privilege(
        current_user,
        'pg_catalog.set_config(text,text,boolean)',
        'EXECUTE'
      ) AS has_exec
    `;
    if (rows[0]?.has_exec) {
      throw new SetConfigNotRevokedError();
    }
    logger.info('Database preflight passed: set_config is not executable by application role.');
  } finally {
    await client.end({ timeout: 5 });
  }
};

export class BaCredentialAccessNotRevokedError extends Error {
  constructor(public readonly grants: { table: string; priv: string }[]) {
    super(
      'TEN-07: resto_app retains the following privileges on BA credential tables: ' +
        grants.map((g) => `${g.priv} ${g.table}`).join(', ') +
        '. Re-run `pnpm db:migrate` (migration 0027).',
    );
    this.name = 'BaCredentialAccessNotRevokedError';
  }
}

// TEN-07: enforce migration 0027 stays applied; resto_app role must hold ZERO
// privileges on BA credential tables. has_table_privilege handles role-inheritance
// chains transparently.
const BA_TABLES = ['account', 'session', 'two_factor', 'verification'] as const;
const BA_PRIVS = ['SELECT', 'INSERT', 'UPDATE'] as const;

export const assertNoBaCredentialAccess = async (url: string): Promise<void> => {
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });
  try {
    const rows = await Promise.all(
      BA_TABLES.flatMap((table) =>
        BA_PRIVS.map(async (priv) => {
          const r = await client<{ has: boolean }[]>`
            SELECT has_table_privilege(current_user, ${table}, ${priv}) AS has
          `;
          return { table, priv, has: r[0]?.has ?? false };
        }),
      ),
    );
    const offending = rows.filter((r) => r.has);
    if (offending.length > 0) {
      throw new BaCredentialAccessNotRevokedError(
        offending.map((r) => ({ table: r.table, priv: r.priv })),
      );
    }
    logger.info(
      { checks: BA_TABLES.length * BA_PRIVS.length },
      'Database preflight passed: resto_app has zero privileges on BA credential tables.',
    );
  } finally {
    await client.end({ timeout: 5 });
  }
};

export class InboxProcessedDeleteMissingError extends Error {
  constructor() {
    super(
      'TEN-13: resto_app lacks DELETE on inbox_processed. ' +
        'The daily retention sweep cannot run; rows accumulate unbounded. ' +
        'Re-run `pnpm db:migrate` (migration 0028) or re-provision the role ' +
        '(`packages/db/sql/roles.sql` issues the GRANT post-migrate).',
    );
    this.name = 'InboxProcessedDeleteMissingError';
  }
}

// TEN-13 defense-in-depth: migration 0028 + roles.sql each issue the GRANT
// independently so the end state is order-independent. This preflight is the
// boot-time witness that one of them won. Surfaces the misconfig in startup
// logs instead of as a silent cron no-op (which is exactly how the bug shipped
// in the first place — `InboxRetentionService.run()` swallows the permission
// error in its try/catch).
export const assertInboxProcessedDeletable = async (url: string): Promise<void> => {
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });
  try {
    const rows = await client<{ has: boolean }[]>`
      SELECT has_table_privilege(current_user, 'inbox_processed', 'DELETE') AS has
    `;
    if (rows[0]?.has !== true) {
      throw new InboxProcessedDeleteMissingError();
    }
    logger.info('Database preflight passed: resto_app holds DELETE on inbox_processed.');
  } finally {
    await client.end({ timeout: 5 });
  }
};

export class WithoutTenantAllowlistMisalignedError extends Error {
  constructor(public readonly missing: string[]) {
    super(
      'TEN-11: WITHOUT_TENANT_ALLOWLIST entries point at files that do not exist: ' +
        missing.join(', ') +
        '. Either restore the file (likely a rename or delete) or remove the dead ' +
        'entry from packages/db/src/withoutTenant.allowlist.ts and the parity ESLint ' +
        'overrides.',
    );
    this.name = 'WithoutTenantAllowlistMisalignedError';
  }
}

// D-08 + Pitfall 6: presence-check only. Call-site enforcement is the ESLint
// job (TEN-12); this function catches "allowlist entry pointed at a renamed/deleted
// file" at boot. Resolves paths against the workspace root (detected by
// pnpm-workspace.yaml), not process.cwd(), so the check works whether boot is
// from the repo root (dev) or the api app directory (built image).
// G-01: returns null when no workspace root is found (bundled/Docker context
// where pnpm-workspace.yaml is not present) so the caller can skip the FS check.
const findWorkspaceRoot = (start: string): string | null => {
  let dir = start;
  // Walk up until pnpm-workspace.yaml is found or we hit the filesystem root.
  // A stuck loop is impossible: every iteration ascends one directory.
  for (;;) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};

// G-01: esbuild rewrites import.meta to {} in CJS, so import.meta.url is
// undefined at runtime even though TypeScript types it as `string`. Cast
// through `{ url?: string }` so the null-check is well-typed without a
// non-null assertion, and fall back to process.cwd() in bundled/Docker context.
const metaUrl = (import.meta as { url?: string }).url;
const WORKSPACE_ROOT =
  metaUrl != null
    ? findWorkspaceRoot(dirname(fileURLToPath(metaUrl)))
    : findWorkspaceRoot(process.cwd());

export const assertWithoutTenantCallsiteRegistered = (
  allowlist: readonly string[] = WITHOUT_TENANT_ALLOWLIST,
): void => {
  if (WORKSPACE_ROOT === null) {
    // Bundled/Docker context: source files are not present on disk; the
    // ESLint call-site fence (TEN-12) already enforced this at build time.
    logger.info(
      { allowed: allowlist.length },
      'Database preflight skipped (bundled context): withoutTenant allowlist FS check not applicable.',
    );
    return;
  }
  const missing: string[] = [];
  for (const entry of allowlist) {
    if (!existsSync(resolve(WORKSPACE_ROOT, entry))) {
      missing.push(entry);
    }
  }
  if (missing.length > 0) {
    throw new WithoutTenantAllowlistMisalignedError(missing);
  }
  logger.info(
    { allowed: allowlist.length },
    'Database preflight passed: every withoutTenant allowlist entry resolves to a file on disk.',
  );
};

interface ExpectedRoleAttributes {
  readonly rolsuper: boolean;
  readonly rolbypassrls: boolean;
  readonly rolcreaterole: boolean;
  readonly rolcreatedb: boolean;
}

/**
 * Thrown when a provisioned role does not have the expected attribute
 * set. Defense-in-depth: catches anyone bypassing `provisionAppRole` /
 * `provisionAuthRole` (hand-crafted SQL, an attacker who slipped a
 * privilege escalation in, etc.).
 */
export class RoleAttributeMismatchError extends Error {
  constructor(
    public readonly role: string,
    public readonly expected: ExpectedRoleAttributes,
    public readonly actual: ExpectedRoleAttributes,
  ) {
    super(
      `Role "${role}" has unexpected attributes. ` +
        `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}. ` +
        `Provisioning was likely bypassed or tampered with — refuse to proceed.`,
    );
    this.name = 'RoleAttributeMismatchError';
  }
}

/**
 * Verify that a named role has the expected attributes. Called at the
 * end of `provisionAppRole` / `provisionAuthRole` as defense-in-depth.
 */
export const assertRoleAttributes = async (
  client: Sql,
  roleName: string,
  expected: ExpectedRoleAttributes,
): Promise<void> => {
  const rows = await client<(ExpectedRoleAttributes & { rolname: string })[]>`
    SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
    FROM pg_roles
    WHERE rolname = ${roleName}
  `;
  const row = rows[0];
  if (!row) {
    throw new Error(`assertRoleAttributes: role "${roleName}" does not exist.`);
  }
  const { rolname: _ignored, ...actual } = row;
  for (const key of Object.keys(expected) as (keyof ExpectedRoleAttributes)[]) {
    if (actual[key] !== expected[key]) {
      throw new RoleAttributeMismatchError(roleName, expected, actual);
    }
  }
};
