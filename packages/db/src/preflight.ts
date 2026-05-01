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
