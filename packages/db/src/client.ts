import { and, eq, sql, type SQL } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { PgColumn } from 'drizzle-orm/pg-core';
import postgres, { type Sql } from 'postgres';
import { getTenantContext, isUuid, requireTenantContext } from './context';
import { logger } from './logger';
import * as schema from './schema/index';

export type RestoSchema = typeof schema;

/**
 * Drizzle transaction handle scoped to a Resto schema. All tenant-aware
 * operations receive one of these — never the unscoped `db` directly.
 */
export type RestoTx = Parameters<Parameters<PostgresJsDatabase<RestoSchema>['transaction']>[0]>[0];

/**
 * Compile-time marker for tables carrying `tenant_id NOT NULL`. Derived
 * as the union of every table in `@resto/db`'s schema that exposes a
 * `tenantId` column. Drizzle's `.from()` / `.insert()` generics resolve
 * cleanly against concrete tables in the union — far less friction than
 * an abstract `PgTable` constraint, which forces Drizzle's internal
 * `TableLikeHasEmptySelection<T>` check to fail evaluation.
 *
 * Adding a new tenant-scoped table to the schema (via `tenantIdColumn()`)
 * extends this union automatically — no manual opt-in required. Tables
 * without a `tenantId` column (e.g. the `tenants` table itself) are
 * excluded by the conditional and rejected at `selectFrom()` compile time.
 */
export type TenantScopedTable = {
  [K in keyof typeof schema]: (typeof schema)[K] extends { tenantId: PgColumn }
    ? (typeof schema)[K]
    : never;
}[keyof typeof schema];

/**
 * Tenant-scoped query builder. Wraps a `RestoTx` with a pinned tenantId;
 * every helper method auto-applies `eq(table.tenantId, this.tenantId)` on
 * SELECT / UPDATE and auto-injects `tenantId` on INSERT.
 *
 * Obtained from `TenantAwareDb.withTenant(op)` / `withTenantId(id, op)`
 * as the second callback argument. Not directly constructible by callers —
 * the wiring guarantees a tenant context is bound.
 *
 * For queries that must escape (joins to non-tenant tables, raw SQL),
 * use the unrestricted `tx` (first callback argument). The escape is
 * audited by code review, not the type system.
 *
 * No `deleteFrom` — project policy forbids hard deletes (`resto_app`
 * role lacks DELETE privilege; soft-delete via `archived_at` is the rule).
 * See `packages/db/sql/roles.sql:39`.
 */
export class ScopedTx {
  constructor(
    private readonly tx: RestoTx,
    private readonly tenantId: string,
  ) {}

  /**
   * SELECT with auto-applied `eq(table.tenantId, this.tenantId)`. Pass
   * any extra predicate as the second argument; it is composed with the
   * tenant filter via `and()`. The returned Drizzle builder is
   * post-`.where()` — caller chains `.limit/.orderBy/.innerJoin/...`
   * freely but should NOT call `.where()` again (Drizzle replaces;
   * tenant filter is lost).
   *
   * Drizzle's `.from()` generic rejects `T extends TenantScopedTable`
   * because `TableLikeHasEmptySelection<T>` cannot reduce for a generic
   * union member. We delegate through an internal helper that uses a
   * boundary cast; the public method preserves T's row inference by
   * declaring the return as `Awaited<...>` derived from `T['$inferSelect']`.
   */
  selectFrom<T extends TenantScopedTable>(
    table: T,
    extraWhere?: SQL,
  ): Promise<T['$inferSelect'][]> & {
    limit: (n: number) => Promise<T['$inferSelect'][]>;
    orderBy: (...exprs: readonly SQL[]) => Promise<T['$inferSelect'][]>;
  } {
    const tenantFilter = eq(table.tenantId, this.tenantId);
    const where = extraWhere ? and(tenantFilter, extraWhere) : tenantFilter;
    return this.tx
      .select()
      .from(table as never)
      .where(where);
  }

  /**
   * INSERT with auto-injected tenantId. Caller-provided values MUST NOT
   * include `tenantId` — the TypeScript signature forbids it, and a
   * runtime guard throws if it leaks through (e.g. via `as unknown` cast).
   * The runtime guard catches the cross-tenant insert primitive that
   * would otherwise let a row from tenant A be re-inserted under
   * tenant B's ALS context.
   *
   * Drizzle's `.values()` generic shape over `T['$inferInsert']` requires
   * concrete column metadata; `as never` casts unblock the chained call.
   */
  insertInto<T extends TenantScopedTable>(
    table: T,
    values: Omit<T['$inferInsert'], 'tenantId'>,
  ): ReturnType<RestoTx['insert']>['values'] extends (v: never) => infer R ? R : never {
    if ('tenantId' in (values as object)) {
      const offending = (values as unknown as { tenantId: unknown }).tenantId;
      throw new Error(
        `ScopedTx.insertInto: values must not include tenantId — it is injected from the bound tenant context. Got tenantId=${JSON.stringify(offending)}.`,
      );
    }
    return this.tx.insert(table).values({ ...values, tenantId: this.tenantId } as never);
  }

  /**
   * UPDATE with auto-applied `eq(table.tenantId, this.tenantId)`. Returns
   * a builder ready for `.returning()` or `.execute()`. Extra where
   * composes with the tenant filter via `and()` — same pattern as
   * `selectFrom`.
   */
  updateTable<T extends TenantScopedTable>(
    table: T,
    set: Partial<T['$inferInsert']>,
    extraWhere?: SQL,
  ): ReturnType<RestoTx['update']>['set'] extends (s: never) => infer R ? R : never {
    const tenantFilter = eq(table.tenantId, this.tenantId);
    const where = extraWhere ? and(tenantFilter, extraWhere) : tenantFilter;
    return this.tx
      .update(table)
      .set(set as never)
      .where(where) as never;
  }
}

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
 * Binding is funneled through the SECURITY DEFINER wrapper
 * `app_bind_tenant(text, boolean)` (RES-243). `resto_app` cannot call
 * `pg_catalog.set_config` directly — the PUBLIC grant is revoked. A
 * mismatch between the GUC value at bind time and at end-of-callback is
 * detected by `#assertGucUnchanged`, which throws and rolls back the
 * transaction so wrong-tenant rows never reach the caller.
 *
 * Use the `withoutTenant(reason, op)` escape hatch for system code that
 * legitimately needs to see across tenants (migrations, outbox dispatcher,
 * platform admin). Every bypass is logged with the reason; the same
 * wrapper enforces "no rebind" while the GUC is empty.
 *
 * The formal contract for the three methods is in RES-238 (separate PR).
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
   * RES-243 drift sentinel: assert `app.current_tenant` (and optionally
   * `app.current_brand`) still match the values bound at transaction start.
   * Catches `SET LOCAL` / `RESET` forge forms that `REVOKE EXECUTE` on
   * `set_config` cannot block.
   *
   * Called at end of every `withTenant` / `withTenantId` / `withoutTenant`
   * callback before the result is returned, so a drift throws while
   * Drizzle still rolls the transaction back — the locally-computed
   * `result` is discarded and never reaches the caller.
   *
   * Note: the rollback covers the database transaction only. If the
   * callback triggered out-of-band side effects (NATS publish, HTTP call,
   * file write) before the drift was detected, those side effects are NOT
   * undone. The RES-243 contract is about preventing wrong-tenant data
   * from reaching the HTTP response — out-of-band leakage is a separate
   * class of bug addressed by the I-1 mandatory tenant filter / ScopedTx.
   */
  async #assertGucUnchanged(
    tx: RestoTx,
    expected: string,
    scope: string,
    expectedBrand?: string,
    expectedLocation?: string,
  ): Promise<void> {
    const rows = await tx.execute<{ v: string | null }>(
      sql`SELECT current_setting('app.current_tenant', true) AS v`,
    );
    const actual = rows[0]?.v ?? '';
    if (actual !== expected) {
      throw new Error(
        `Tenant GUC drift detected in ${scope}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}. Transaction rolled back.`,
      );
    }
    if (expectedBrand !== undefined) {
      const brandRows = await tx.execute<{ v: string | null }>(
        sql`SELECT current_setting('app.current_brand', true) AS v`,
      );
      const actualBrand = brandRows[0]?.v ?? '';
      if (actualBrand !== expectedBrand) {
        throw new Error(
          `Brand GUC drift detected in ${scope}: expected ${JSON.stringify(expectedBrand)}, got ${JSON.stringify(actualBrand)}. Transaction rolled back.`,
        );
      }
    }
    if (expectedLocation !== undefined) {
      const locationRows = await tx.execute<{ v: string | null }>(
        sql`SELECT current_setting('app.current_location', true) AS v`,
      );
      const actualLocation = locationRows[0]?.v ?? '';
      if (actualLocation !== expectedLocation) {
        throw new Error(
          `Location GUC drift detected in ${scope}: expected ${JSON.stringify(expectedLocation)}, got ${JSON.stringify(actualLocation)}. Transaction rolled back.`,
        );
      }
    }
  }

  /**
   * Run `op` inside a transaction with the current tenant context bound.
   * RLS will reject any row whose `tenant_id` does not match.
   *
   * Binding goes through the `app_bind_tenant` SECURITY DEFINER wrapper
   * (RES-243). The wrapper raises on rebind to a different tenant;
   * same-tenant rebind is idempotent.
   *
   * When `ctx.brandId` is present (set by TenantContextMiddleware for
   * brand-scoped routes), `app_bind_brand` is called AFTER `app_bind_tenant`
   * so the brand RLS policy can filter rows by current_brand_id(). The
   * drift sentinel is extended to cover `app.current_brand` in that case.
   *
   * When `ctx.locationId` is present (set via `withLocation`/session pin
   * for location-scoped routes), `app_bind_location` is called AFTER
   * `app_bind_brand` so the location RLS policy can filter rows by
   * current_location_id(). The drift sentinel is extended to cover
   * `app.current_location` in that case.
   */
  async withTenant<T>(op: (tx: RestoTx, scoped: ScopedTx) => Promise<T>): Promise<T> {
    const ctx = requireTenantContext();
    return this.#db.transaction(async (tx) => {
      await tx.execute(sql`SELECT app_bind_tenant(${ctx.tenantId}, false)`);
      if (ctx.brandId !== undefined) {
        await tx.execute(sql`SELECT app_bind_brand(${ctx.brandId}::text)`);
      }
      if (ctx.locationId !== undefined) {
        await tx.execute(sql`SELECT app_bind_location(${ctx.locationId}::text)`);
      }
      const result = await op(tx, new ScopedTx(tx, ctx.tenantId));
      await this.#assertGucUnchanged(tx, ctx.tenantId, 'withTenant', ctx.brandId, ctx.locationId);
      return result;
    });
  }

  /**
   * Run `op` inside a transaction with an EXPLICIT tenant id bound.
   *
   * Reserved for non-HTTP entry points where the caller has an
   * authoritative tenant id but does not run inside
   * `TenantContextMiddleware`:
   *   - Better Auth hooks (`/sign-out`, `/reset-password`) — ADR-0020 I-6.
   *   - NATS subscribers, outbox dispatcher, CLI, background jobs.
   *
   * HTTP code paths MUST use `withTenant(op)` (ALS-bound). To enforce
   * the split, `withTenantId` throws when an ALS context is already
   * bound — that path indicates a mis-routed caller.
   */
  async withTenantId<T>(
    tenantId: string,
    op: (tx: RestoTx, scoped: ScopedTx) => Promise<T>,
  ): Promise<T> {
    if (getTenantContext()) {
      throw new Error(
        'withTenantId must not be called inside an ALS-bound context — use withTenant() instead.',
      );
    }
    if (!isUuid(tenantId)) {
      throw new Error(`Invalid tenant id: expected a uuid, got ${JSON.stringify(tenantId)}.`);
    }
    return this.#db.transaction(async (tx) => {
      await tx.execute(sql`SELECT app_bind_tenant(${tenantId}, false)`);
      const result = await op(tx, new ScopedTx(tx, tenantId));
      await this.#assertGucUnchanged(tx, tenantId, 'withTenantId');
      return result;
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
      await tx.execute(sql`SELECT app_bind_tenant('', true)`);
      const result = await op(tx);
      await this.#assertGucUnchanged(tx, '', 'withoutTenant');
      return result;
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
