import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { requireTenantContext } from './context';
import { logger } from './logger';
import * as schema from './schema/index';

export type RestoSchema = typeof schema;

/**
 * Drizzle transaction handle scoped to a Resto schema. All tenant-aware
 * operations receive one of these — never the unscoped `db` directly.
 */
export type RestoTx = Parameters<Parameters<PostgresJsDatabase<RestoSchema>['transaction']>[0]>[0];

export interface ResolvedConnection {
  /**
   * Underlying postgres-js client. Useful for raw SQL when Drizzle's
   * type-safe builder is not expressive enough; should be rare.
   */
  readonly raw: Sql;
  /** Drizzle-flavored handle bound to the same connection pool. */
  readonly db: PostgresJsDatabase<RestoSchema>;
}

export interface CreateClientOptions {
  /** Postgres connection URL — `postgres://user:pass@host:port/db`. */
  readonly url: string;
  /** Maximum connections in the pool. Default 10 — tune per workload. */
  readonly maxConnections?: number;
  /** Idle-connection timeout in seconds. Default 20. */
  readonly idleTimeoutSeconds?: number;
}

/**
 * Tenant-aware Drizzle client.
 *
 * Every operation runs inside a Postgres transaction with `app.current_tenant`
 * bound to the current `TenantContext.tenantId`, so RLS policies enforce
 * isolation at the database layer regardless of application bugs.
 *
 * Use the `withoutTenant(reason, op)` escape hatch for system code that
 * legitimately needs to see across tenants (migrations, outbox dispatcher,
 * platform admin). Every bypass is logged with the reason.
 */
export class TenantAwareDb {
  readonly #db: PostgresJsDatabase<RestoSchema>;

  readonly #raw: Sql;

  constructor(private readonly options: CreateClientOptions) {
    this.#raw = postgres(options.url, {
      max: options.maxConnections ?? 10,
      idle_timeout: options.idleTimeoutSeconds ?? 20,
      prepare: false,
      onnotice: () => undefined,
    });
    this.#db = drizzle(this.#raw, { schema, casing: 'snake_case' });
  }

  /** The connection pool — exposed for migration runners and tests. */
  get connection(): ResolvedConnection {
    return { raw: this.#raw, db: this.#db };
  }

  /**
   * Run `op` inside a transaction with the current tenant context bound.
   * RLS will reject any row whose `tenant_id` does not match.
   */
  async withTenant<T>(op: (tx: RestoTx) => Promise<T>): Promise<T> {
    const ctx = requireTenantContext();
    return this.#db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant', ${ctx.tenantId}, true)`);
      await tx.execute(sql`SELECT set_config('app.is_system', 'false', true)`);
      return op(tx);
    });
  }

  /**
   * Escape hatch for system code that must see across tenants:
   * migrations, outbox dispatcher, seed CLI, platform-admin dashboards.
   *
   * Every call is logged at WARN with the reason. The bypass lasts for
   * the transaction only — `SET LOCAL` is rolled back automatically.
   */
  async withoutTenant<T>(reason: string, op: (tx: RestoTx) => Promise<T>): Promise<T> {
    if (reason.trim().length === 0) {
      throw new Error('withoutTenant(reason, op) requires a non-empty reason.');
    }
    logger.warn({ reason }, 'Running database operation without a tenant context (RLS bypass)');
    return this.#db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.is_system', 'true', true)`);
      await tx.execute(sql`SELECT set_config('app.current_tenant', '', true)`);
      return op(tx);
    });
  }

  /**
   * Connectivity probe used by the health endpoint. Issues a trivial
   * `SELECT 1` outside any tenant context. Lives here so callers do not
   * need to import `sql` from `drizzle-orm` — that template tag is the
   * privileged escape hatch for raw SQL and must stay inside `packages/db`.
   */
  async ping(): Promise<void> {
    await this.#raw`SELECT 1`;
  }

  /** Close the connection pool. Used by tests and graceful shutdown. */
  async close(): Promise<void> {
    await this.#raw.end({ timeout: 5 });
  }
}

/**
 * Convenience constructor — most callers want this rather than `new TenantAwareDb(...)`
 * to align with the rest of the codebase's factory style.
 */
export const createDb = (options: CreateClientOptions): TenantAwareDb => new TenantAwareDb(options);
