---
name: resto-multi-tenancy
description: Authoritative reference for the Resto multi-tenancy contract. Covers AsyncLocalStorage propagation, TenantAwareDb, Postgres RLS policies, and outbox-aware writes. Load when touching any code that reads or writes to the database.
when_to_use: |
  - Adding or modifying a domain table (schema, migration, RLS policy)
  - Writing or reviewing a repository method
  - Implementing CLI/job code that needs cross-tenant DB access
  - Debugging RLS errors or unexpected data leaks
  - Writing tests that touch the DB layer
status: active
---

# Resto Multi-Tenancy Contract

Resto isolates tenant data at two layers: AsyncLocalStorage carries the tenant id through the async call stack, and Postgres Row-Level Security enforces it at the DB layer. ADR-0006 defines the RLS approach; ADR-0004 defines the outbox pattern that keeps event writes atomic with state changes. This skill documents the exact API — not aspirational shapes, the actual code.

---

## 1. Schema

Every domain table carries:

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` — via `pkUuid()` helper.
- `tenant_id uuid NOT NULL` — via `tenantIdColumn()` helper. FK to `tenants.id`, `ON DELETE RESTRICT`.
- `created_at`, `updated_at`, `archived_at` — via `timestampsColumns()`. No hard deletes in production.

Use the helpers from `packages/db/src/schema/_columns.ts`:

```ts
import { pkUuid, tenantIdColumn, timestampsColumns } from './_columns';

export const myTable = pgTable('my_table', {
  id: pkUuid(),
  tenantId: tenantIdColumn(),
  // ...domain columns...
  ...timestampsColumns(),
});
```

The `tenants` table is the exception — its primary key IS the tenant id; it uses `pkUuid()` only and no `tenantIdColumn()`.

---

## 2. AsyncLocalStorage — tenant context propagation

Source: `packages/db/src/context.ts`, exported via `@resto/db`.

```ts
interface TenantContext {
  readonly tenantId: string; // UUID v4 — validated before binding
  readonly correlationId?: string; // mirrors OTel baggage; set by HTTP middleware
}
```

Three functions:

| Function                      | When to use                                                               |
| ----------------------------- | ------------------------------------------------------------------------- |
| `runInTenantContext(ctx, op)` | HTTP layer only — `TenantContextMiddleware` calls this.                   |
| `requireTenantContext()`      | DB client calls this automatically; repositories do NOT call it directly. |
| `getTenantContext()`          | Telemetry/logging infra only — reads optionally without throwing.         |

`runInTenantContext` validates that `tenantId` is a valid UUID before binding; rejects with an error otherwise. HTTP is currently the only entry point that calls it. CLI and job code must NOT call it — use `db.withoutTenant()` instead (see §3).

---

## 3. DB client — `TenantAwareDb`

Source: `packages/db/src/client.ts`, exported via `@resto/db`.

Created via factory: `createDb(options: CreateClientOptions): TenantAwareDb`. Injected into NestJS modules as a provider.

### Tenant-scoped writes/reads (HTTP path)

```ts
const result = await db.withTenant(async (tx) => {
  return tx
    .insert(myTable)
    .values({ tenantId: ctx.tenantId, ...fields })
    .returning();
});
```

`withTenant` calls `requireTenantContext()`, opens a transaction, then sets (transaction-local):

```sql
SELECT set_config('app.current_tenant', '<uuid>', true);
SELECT set_config('app.is_system', 'false', true);
```

RLS then enforces isolation automatically — the policy rejects any row whose `tenant_id` does not match.

### System/cross-tenant writes (CLI, outbox dispatcher, migrations)

```ts
const rows = await db.withoutTenant(
  'bootstrap-owner: seeding initial owner',
  async (tx) => {
    return tx.select().from(tenants);
  },
);
```

`withoutTenant(reason, op)` requires a non-empty `reason` string, logs it at WARN, then sets:

```sql
SELECT set_config('app.is_system', 'true', true);
SELECT set_config('app.current_tenant', '', true);
```

The bypass lasts for that transaction only. **There is no `__systemQuery()` or any other cross-tenant escape hatch** — `withoutTenant` is the only one.

---

## 4. RLS — Postgres side

### Stable functions (migration `0001_rls_policies.sql`)

```sql
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT nullif(current_setting('app.current_tenant', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION is_system_session() RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT coalesce(nullif(current_setting('app.is_system', true), ''), 'false')::boolean;
$$;
```

`current_tenant_id()` returns NULL if no tenant is set (rather than throwing), so the USING clause naturally rejects cross-tenant reads without error propagation from the function itself.

### Policy template (every domain table)

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table> FORCE ROW LEVEL SECURITY;

CREATE POLICY <table>_iso ON <table>
  USING      (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
```

`FORCE ROW LEVEL SECURITY` applies the policy to the table owner too — schema ownership does not bypass isolation.

### Two-role model

| Role          | Attributes                | Used by                             |
| ------------- | ------------------------- | ----------------------------------- |
| `resto_admin` | superuser within database | `drizzle-kit migrate` only          |
| `resto_app`   | `NOSUPERUSER NOBYPASSRLS` | `apps/api` and all runtime services |

The runtime role `resto_app` is provisioned by `packages/db/sql/roles.sql`. It holds `SELECT, INSERT, UPDATE, DELETE` on all tables with default privileges for future tables.

### Startup guard

```ts
import { assertNoRlsBypass } from '@resto/db';
await assertNoRlsBypass(databaseUrl); // call once in api bootstrap, before serving traffic
```

`assertNoRlsBypass` opens a one-shot connection, queries `pg_roles` for `rolsuper` and `rolbypassrls` on `current_user`, and throws `RlsBypassError` if either is true. Fails fast so misconfigured credentials surface at startup, not during a live request.

---

## 5. Outbox-aware writes

ADR-0004 prohibits dual-writes: no broker publish outside a committed DB transaction. Every state change that produces a domain event must INSERT into `outbox_events` in the same transaction.

```ts
await db.withTenant(async (tx) => {
  const [order] = await tx.insert(orders).values(orderPayload).returning();

  await tx.insert(outboxEvents).values({
    tenantId: ctx.tenantId, // nullable — omit for platform-level events
    aggregateId: order.id,
    type: 'orders.placed.v1', // format: <context>.<event>.v<n> (CHECK-enforced)
    payload: { orderId: order.id /* ... */ },
  });
});
```

`outbox_events` schema (`packages/db/src/schema/outbox.ts`):

- `tenant_id uuid` — nullable (platform events like `tenant.provisioned.v1` have no tenant).
- `type text` — format `<ctx>.<event>.v<n>` enforced by CHECK constraint.
- `payload jsonb`, `headers jsonb` — broker-agnostic envelope from `@resto/events`.
- `claimed_at`, `delivered_at` — dispatcher lifecycle columns (NULL = not yet claimed/delivered).
- Partial index on `occurred_at WHERE delivered_at IS NULL` — dispatcher working set.

The outbox dispatcher (system context) uses `db.withoutTenant('outbox dispatcher', ...)` to poll and claim unclaimed rows across all tenants.

---

## Checklist — adding a new domain table

- [ ] Schema uses `pkUuid()`, `tenantIdColumn()`, `timestampsColumns()` helpers.
- [ ] Table added to `packages/db/src/schema/index.ts`.
- [ ] Migration generated: `pnpm --filter @resto/db drizzle-kit generate`.
- [ ] RLS policy added in the same migration: `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, `CREATE POLICY <table>_iso`.
- [ ] Policy uses stable functions (`is_system_session()`, `current_tenant_id()`), not inline `current_setting(...)` calls.
- [ ] All repository methods use `db.withTenant(async (tx) => ...)` — never the raw `db.connection.db`.
- [ ] State changes that produce events INSERT into `outbox_events` in the same transaction.
- [ ] If the table has nullable `tenant_id` (e.g. audit/outbox style), the RLS policy handles `tenant_id IS NULL` explicitly — do not copy the standard template blindly.
- [ ] Migration is immutable once deployed — no edits to existing migration files.
- [ ] New index added CONCURRENTLY in a separate migration if the table is large.

---

## Red flags (hard fail in review)

- Repository method queries `db.connection.db` directly — bypasses tenant context check.
- `withoutTenant` called from an HTTP request handler — not a system context.
- `withoutTenant` called with an empty reason string — throws at runtime, and indicates missing intent.
- New domain table without `FORCE ROW LEVEL SECURITY` — owner role bypasses isolation.
- Policy written with `current_setting('app.current_tenant', true)` inline instead of `current_tenant_id()` — misses the `nullif` cast, leaks rows when no tenant is set.
- Event published outside the state-change transaction — dual-write; guaranteed eventual inconsistency.
- `runInTenantContext` called from CLI or job code — wrong entry point; tenantId must come from the job's context, not a middleware.
- Migration file edited after being committed to the repo — migrations are immutable.
- Runtime service connecting as `resto_admin` — bypasses RLS entirely.

---

## Self-test

> "Show me how to add a `reservations` table that belongs to a tenant, fires a `reservations.created.v1` event, and is readable only within the correct tenant context."

---

## Sources

- `packages/db/src/context.ts` — `TenantContext`, `runInTenantContext`, `requireTenantContext`, `getTenantContext`
- `packages/db/src/client.ts` — `TenantAwareDb`, `createDb`, `withTenant`, `withoutTenant`
- `packages/db/src/preflight.ts` — `assertNoRlsBypass`, `RlsBypassError`
- `packages/db/src/schema/outbox.ts` — `outboxEvents` table
- `packages/db/src/schema/_columns.ts` — `pkUuid`, `tenantIdColumn`, `timestampsColumns`
- `packages/db/migrations/0001_rls_policies.sql` — stable functions + policy definitions
- `packages/db/sql/roles.sql` — `resto_app` / `resto_admin` provisioning
- ECC postgres-patterns @ `841beea45cb25ba51f29fa45b7e272938d19b80a` — index patterns, `FOR UPDATE SKIP LOCKED`
- ECC database-migrations @ `841beea45cb25ba51f29fa45b7e272938d19b80a` — migration safety checklist, Drizzle commands
- ADR-0003 (Drizzle ORM on Postgres), ADR-0004 (NATS JetStream / outbox pattern), ADR-0006 (multi-tenancy with RLS)
