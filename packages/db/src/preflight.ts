import postgres, { type Sql } from 'postgres';
import { logger } from './logger';

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
