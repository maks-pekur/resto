# @resto/db

Persistence layer for Resto. Owns the database, full stop — no other
package or app issues raw SQL or holds a Postgres connection. Other code
imports `@resto/db` and uses the tenant-aware client.

## Layout

```
src/
  schema/        Drizzle table definitions (one file per logical group)
    _types.ts    citext, money, LocalizedText
    _columns.ts  pkUuid, tenantIdColumn, timestampsColumns helpers
    tenants.ts
    users.ts
    menu.ts
    audit.ts
    index.ts     public re-export — drizzle.config.ts targets this
  cli/
    migrate.ts   apply migrations (run via `pnpm db:migrate`)
    reset.ts     drop+recreate dev schema (refuses outside development)
  context.ts     AsyncLocalStorage tenant context
  client.ts      TenantAwareDb — withTenant() / withoutTenant()
  index.ts       public surface

migrations/      drizzle-kit output + hand-written RLS migration
test/
  unit/          fast tests, no Docker
  integration/   testcontainers-backed RLS tests
```

## Multi-tenancy contract

Every domain table has a `tenant_id` column and indexes lead with it.
Tenant isolation is enforced two ways:

1. **Application layer** — `TenantAwareDb#withTenant` opens a transaction
   and binds the tenant id from `AsyncLocalStorage` to the Postgres
   session variable `app.current_tenant`.
2. **Database layer** — every tenant-scoped table has `ENABLE` and
   `FORCE ROW LEVEL SECURITY` plus a policy that compares `tenant_id` to
   `current_tenant_id()` (a SQL function reading `app.current_tenant`).
   `FORCE` makes the policy apply even to the table owner role, so a
   missed `WHERE` clause in application code cannot leak data.

Both layers must agree for a query to return rows. If you bypass one,
the other still protects you.

### Two-role connection model

Postgres superusers and roles with `BYPASSRLS` ignore RLS regardless of
`FORCE`. The application MUST connect as a non-superuser, NOBYPASSRLS
role — otherwise the entire RLS layer collapses silently. We enforce
this by splitting credentials:

| role          | used by                                 | privileges                                           |
| ------------- | --------------------------------------- | ---------------------------------------------------- |
| `resto_admin` | migrations only (`pnpm db:migrate`)     | schema owner; effectively superuser within the DB    |
| `resto_app`   | runtime (`apps/api`, every service)     | LOGIN NOSUPERUSER NOBYPASSRLS; CRUD + sequences only |
| `resto_auth`  | Better Auth's drizzle client (ADR-0013) | LOGIN NOSUPERUSER NOBYPASSRLS; BA-owned tables only  |

The dev stack provisions `resto_app` automatically via
`infra/docker/postgres/init/02-app-role.sql`. Production provisioning
follows the same SQL — see `docs/runbooks/database-roles.md`. The
canonical script lives at `packages/db/sql/roles.sql`; the
`provisionAppRole(client, { appPassword })` helper applies it from Node.
`provisionAuthRole(client, { authPassword })` in `src/auth-role.ts` provisions
`resto_auth` with the same attribute set (NOSUPERUSER NOBYPASSRLS).

**ADR-0013 — `resto_auth` access model (RDS-compatible, migration 0054):**
Better Auth's drizzle client connects as `resto_auth` (NOBYPASSRLS) and
reaches the four RLS-enabled BA-owned tables it needs — `member`,
`invitation`, `organization_role`, `tenants` — via explicit permissive
`CREATE POLICY ... FOR ALL TO resto_auth USING(true) WITH CHECK(true)` policies
(migration 0054). Postgres OR-combines these with the existing PUBLIC
tenant-isolation policies, giving `resto_auth` full access to those
tables without the `BYPASSRLS` attribute. The `TO resto_auth` clause
scopes each policy exclusively to `resto_auth`; `resto_app` keeps only
the PUBLIC tenant-isolation policy and its cross-tenant isolation is
unchanged.

**Why not `BYPASSRLS`:** AWS RDS's master is `rds_superuser`, NOT a true
`SUPERUSER`. Conferring `BYPASSRLS` on another role requires superuser, so
`ALTER ROLE resto_auth WITH BYPASSRLS` hard-stops on RDS. The permissive-policy
approach is RDS-compatible and equivalent in effect for the BA surface.

**RES-206 exception:** the runtime `resto_app` role does NOT have grants
on the 4 BA credential tables (`account`, `two_factor`, `verification`,
`session`). These hold password hashes, OAuth tokens, 2FA secrets, and
session bearer tokens. Migration `0027` revokes the grants; `sql/roles.sql`
mirrors. `resto_auth` reaches these non-RLS tables as a plain grantee —
no policy is needed (no RLS, no bypass required).

Apps must call `assertNoRlsBypass(DATABASE_URL)` once at startup. It
runs a single SELECT against `pg_roles` and throws `RlsBypassError` if
the connected role has `rolsuper` or `rolbypassrls`. Operators see the
misconfiguration in the very first log line, not when a tenant
discovers another tenant's data.

```ts
import { assertNoRlsBypass } from '@resto/db';

await assertNoRlsBypass(process.env.DATABASE_URL!);
```

Migrations and the `db:reset` CLI prefer `DATABASE_ADMIN_URL` over
`DATABASE_URL` — when both are set they connect as the admin role; when
only `DATABASE_URL` is set they fall back with a warning. In production
`DATABASE_ADMIN_URL` MUST be set separately so admin credentials never
sit in the running app's environment.

### Using the client

```ts
import { createDb, runInTenantContext, schema } from '@resto/db';

const db = createDb({ url: process.env.DATABASE_URL! });

await runInTenantContext({ tenantId: '...' }, () =>
  db.withTenant(async (tx) => tx.select().from(schema.menuItems)),
);
```

### Escape hatch — `withoutTenant`

System code that legitimately needs to see across tenants — migrations,
the outbox dispatcher, the seed CLI, platform-admin dashboards — uses
the explicit escape hatch:

```ts
await db.withoutTenant('outbox dispatcher polling all tenants', async (tx) => {
  return tx.select().from(schema.auditLog);
});
```

The reason is mandatory and is logged at WARN. RLS bypass lasts only
for the transaction (`SET LOCAL`).

## Tenant context wrappers — formal contract

The three wrappers `withTenant`, `withTenantId`, `withoutTenant` are the
ONLY sanctioned ways for `apps/api` and the workers to issue SQL against
`resto_app`. Direct `db.transaction(...)` / `db.select(...)` calls bypass
RLS binding and are blocked by ESLint (`no-restricted-syntax` rule under
[RES-235c](https://github.com/maks-pekur/resto/pull/147)). The
SECURITY DEFINER wrapper `app_bind_tenant(text, boolean)` is the only
function authorised to write `app.current_tenant`
([RES-243](https://github.com/maks-pekur/resto/pull/158)); every wrapper
funnels through it.

### Signatures

```ts
// HTTP code path. Reads tenant id from AsyncLocalStorage (bound by
// TenantContextMiddleware). Throws if ALS is empty.
withTenant<T>(op: (tx: RestoTx, scoped: ScopedTx) => Promise<T>): Promise<T>

// Non-HTTP entry points (Better Auth hooks, NATS subscribers, outbox
// dispatcher, CLI, background jobs). Takes the id explicitly.
withTenantId<T>(
  tenantId: string,
  op: (tx: RestoTx, scoped: ScopedTx) => Promise<T>,
): Promise<T>

// System bypass. No tenant binding — RLS allows cross-tenant scans.
// `reason` is mandatory, non-empty, free-form, logged at WARN.
withoutTenant<T>(reason: string, op: (tx: RestoTx) => Promise<T>): Promise<T>
```

### Decision tree — which to call

```
Are you inside an HTTP request handler?
├── yes → withTenant(op)         // ALS already bound by middleware
└── no
    ├── do you have an authoritative tenant id (event envelope, job
    │   payload, BA session)?
    │   └── yes → withTenantId(id, op)
    └── must you cross tenants by design (outbox poll, migration,
        admin dashboard)?
        └── yes → withoutTenant(reason, op)
```

`runInTenantContext` is **HTTP-middleware-only** ([ADR-0020 I-6](../../docs/adr/0020-multi-tenancy-and-event-bus-invariants.md)),
enforced by the `no-restricted-imports` ESLint rule
([RES-239](https://github.com/maks-pekur/resto/pull/144)). Everywhere
else use the wrappers — they bind tenant at the SQL layer (so RLS sees
it) without polluting ALS for code that should not have visibility.

### Nesting

**Rule:** never call another `db.with*` wrapper from inside a wrapper's
callback. The callback owns one Drizzle transaction on one pool
connection; calling `db.with*(...)` from inside acquires a **second**
connection from the pool and opens an **independent** transaction.
Outer's uncommitted writes are invisible to inner; inner's uncommitted
writes are invisible to outer. Connection-pool contention is real;
deadlock on shared rows is possible. Compose by passing the outer `tx`
into helpers instead.

The wrappers have only two **runtime guards** against accidental
nesting; everything else "succeeds" structurally (two-connection
anti-pattern) and must be caught at PR time:

| Nesting attempt                           | What happens                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `withTenant` → `withTenantId`             | **Throws** (JS guard in `client.ts`): _"withTenantId must not be called inside an ALS-bound context."_                                      |
| `withoutTenant` → `withTenant`            | **Throws** — outer does not bind ALS, inner `requireTenantContext()` fails with _"No tenant context bound."_                                |
| `withTenant` → `withTenant` (same tenant) | Succeeds on a new pool connection. `app_bind_tenant(id, false)` is idempotent on same-tenant, so SQL-level guard is silent. Anti-pattern.   |
| `withTenant` → `withTenant` (different)   | Cannot happen — would require rebinding ALS mid-request; `runInTenantContext` is middleware-only (RES-239 ESLint).                          |
| `withTenant` → `withoutTenant`            | Succeeds on a new pool connection. Inner's session has fresh GUC (`v_current=''`), so `app_bind_tenant('', true)` is a no-op. Anti-pattern. |
| `withTenantId` → `withTenant`             | **Throws** — `withTenantId` does not bind ALS; inner `requireTenantContext()` fails.                                                        |
| `withTenantId` → `withTenantId` (same)    | Succeeds on a new pool connection. Covered by `with-tenant-id.spec.ts > nested withTenantId opens a new transaction`.                       |
| `withTenantId` → `withTenantId` (diff)    | Succeeds on a new pool connection (separate sessions don't see each other's GUC). Anti-pattern.                                             |
| `withoutTenant` → `withTenantId`          | Succeeds on a new pool connection. (Distinguish from the case below — same-connection manipulation.)                                        |
| `withoutTenant` → `withoutTenant`         | Succeeds on a new pool connection. Pointless.                                                                                               |

#### Same-connection manipulation (sharper guards)

If you reach into the outer `tx` and call `app_bind_tenant` (or
`SET LOCAL app.current_tenant = …`) on it directly — same SQL session
— the guards bite:

| Action on outer `tx`                                                   | Result                                                                                                                                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inside `withTenant(A)`, `tx.execute(app_bind_tenant('B', false))`      | **Throws SQLSTATE 42501** (`v_current='A'<>p_tenant='B'`). Covered by `tenant-isolation.spec.ts > RES-243: rebind to a different tenant via app_bind_tenant raises`.                                                |
| Inside `withTenant(A)`, `tx.execute(app_bind_tenant('A', false))`      | Idempotent. Covered by `tenant-isolation.spec.ts > RES-243: rebind to the same tenant via app_bind_tenant is idempotent`.                                                                                           |
| Inside `withoutTenant`, `tx.execute(app_bind_tenant(tenantId, false))` | Wrapper succeeds (v_current was `''`); outer `#assertGucUnchanged` then **throws drift**, transaction rolls back. Covered by `tenant-isolation.spec.ts > RES-243: binding a tenant inside withoutTenant is caught`. |
| Any `tx.execute(SET LOCAL app.current_tenant = …)` forge form          | `set_config` EXECUTE is REVOKED from `resto_app` (migration 0023). SQL errors at the role layer. Plus drift sentinel as defense in depth (RES-243).                                                                 |
| Any `tx.execute(RESET app.current_tenant)`                             | Setting goes blank; outer `#assertGucUnchanged` throws drift on exit. Covered by `RES-243: forge via RESET`.                                                                                                        |

### Transaction handle (`tx`) — lifetime

The callback receives a Drizzle `PgTransaction` (alias `RestoTx`), not
the unscoped `db`. One callback = one transaction:

- All-or-nothing commit. A thrown error from `op` rolls everything back.
- Pass `tx` down to repository methods; do not store it past `op`.
- `withTenant` / `withTenantId` also pass a `ScopedTx` as the second
  argument — that is the **preferred** surface for tenant-scoped
  reads/writes. It auto-applies `eq(table.tenantId, ctx.tenantId)` on
  SELECT / UPDATE and auto-injects `tenantId` on INSERT (RES-235).
  Reach for raw `tx` only when the query joins to a non-tenant-scoped
  table or needs raw SQL — those sites are audited at PR time and
  carry an inline comment explaining the escape.

### Async boundary

The wrapper holds the transaction open until the promise returned by
`op` resolves. Concretely:

- ✅ `await`-ed Drizzle queries — the standard pattern.
- ✅ `op` resolves via `setTimeout` / microtask / `process.nextTick` —
  transaction stays open until then. Connection pool waits; nothing
  leaks. (Costs a connection for the duration; keep callbacks short.)
- ❌ `op` schedules a fire-and-forget continuation that runs AFTER
  `op` returns (e.g. an un-`await`-ed `setTimeout(() => tx.insert(...))`).
  That continuation runs OUTSIDE the transaction; the `tx` handle is
  invalid and queries through it throw. No runtime guard catches this
  pattern — reviewers reject it at PR time.
- ❌ Storing `tx` in a module-level variable, returning it from `op`,
  or passing it across an async boundary that outlives `op`. Same
  failure mode; same reviewer-gate.

ALS frame propagation: Node's `AsyncResource` carries the frame across
`await`, microtasks, `setImmediate`, `setTimeout`. Native bindings and
some third-party libraries that detach (rare) lose the frame and
`requireTenantContext()` then throws — preferable to silent leakage.
The wrappers do NOT rebind ALS; they read once at the top of `op`.

### `withoutTenant` — `reason` argument format

- Free-form string, non-empty (whitespace-only rejected).
- Logged at WARN by `logger.ts` with shape:
  `{ pkg: '@resto/db', reason: '<value>', msg: 'Running database operation without a tenant context (RLS bypass)' }`.
- Convention: lowercase `<context>.<action>` dot-notation —
  `'outbox.dispatch'`, `'tenancy.findByDomainHost'`,
  `'migrate.create-extension'`. Test seeds may use sentence fragments
  (`'seed cross-tenant isolation fixture'`).
- NOT an enum. Adding a bypass site should not require a `@resto/db`
  change. Reviewers reject vague reasons like `'admin'` or `'system'`.
- The reason is intentionally NOT surfaced in OTel attributes today —
  the WARN log line is the audit trail. Promoting it to a span
  attribute is a future enhancement (track separately if needed).

### Outbox interaction

The outbox dispatcher polls cross-tenant via
`withoutTenant('outbox.dispatch', ...)` and publishes envelopes as
written. Envelopes are stamped at append time, NOT at dispatch:

- **Stamp at append.** `appendToOutbox(tx, envelope)` from
  `@resto/events` writes the outbox row inside the originating
  `withTenant` / `withTenantId` transaction. `envelope.tenantId` comes
  from the bound tenant context; `envelope.correlationId` is derived
  from the active OTel span via the shared `buildEnvelope` helper
  ([ADR-0020 I-4](../../docs/adr/0020-multi-tenancy-and-event-bus-invariants.md)).
  Same transaction commits both the side effect and the outbox row —
  no dual-write.
- **Forbidden:** emitting a NEW event from inside `withoutTenant`. If
  the dispatcher (or any system-context code) needs to publish a
  tenant-scoped event, it MUST open a nested-by-tenant write via
  `withTenantId(targetTenantId, async (tx) => appendToOutbox(tx, …))`
  — never reuse the `withoutTenant` `tx`.
- Consumers de-dup via `runDeduped(db, envelope, consumer, async (tx) => …)`
  from `@resto/events`. The inbox insert and the handler's side effects
  share one transaction
  ([ADR-0020 I-5](../../docs/adr/0020-multi-tenancy-and-event-bus-invariants.md));
  the handler runs inside `withTenantId(envelope.tenantId, ...)`.

### Boundary with `runInTenantContext`

`runInTenantContext(context, op)` BINDS ALS. The three wrappers READ
ALS (or take an explicit id). Only `TenantContextMiddleware`
(`apps/api/src/shared/tenant-context.middleware.ts`) is allowed to call
`runInTenantContext`; every other call site is rejected by the
`no-restricted-imports` ESLint rule (RES-239). Mapping:

| Call site                           | Wrapper to use                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| HTTP route handler / NestJS service | `withTenant(op)` — middleware already bound ALS                               |
| Better Auth hook (`/sign-out`, …)   | `withTenantId(envelope.tenantId, op)` — no HTTP middleware in the BA pipeline |
| NATS subscriber                     | `withTenantId(envelope.tenantId, op)` — envelope carries the id               |
| Outbox dispatcher poll loop         | `withoutTenant('outbox.dispatch', op)` — by design crosses tenants            |
| Outbox dispatcher per-event publish | `withTenantId(envelope.tenantId, op)` for any DB write per event              |
| Migration / CLI                     | `withoutTenant('migrate.<step>', op)` or run as `resto_admin`                 |
| Background job                      | `withTenantId(jobPayload.tenantId, op)`                                       |

### Test coverage map

The contract above is exercised by integration tests under
`packages/db/test/integration/`:

| Documented behaviour                                  | Test                                                                                          |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `withTenant` reads ALS, throws if empty               | `tenant-isolation.spec.ts` — multiple                                                         |
| `withTenantId` rejects ALS-bound context              | `with-tenant-id.spec.ts > throws when ALS is already bound`                                   |
| `withTenantId` nested same-tenant                     | `with-tenant-id.spec.ts > nested withTenantId opens a new transaction`                        |
| `withoutTenant` requires non-empty reason             | unit guard in `client.ts`; covered indirectly                                                 |
| `app_bind_tenant` same-tenant idempotent              | `tenant-isolation.spec.ts > RES-243: rebind to the same tenant via app_bind_tenant`           |
| `app_bind_tenant` different-tenant raises 42501       | `tenant-isolation.spec.ts > RES-243: rebind to a different tenant via app_bind_tenant raises` |
| `#assertGucUnchanged` catches SET LOCAL / RESET forge | `tenant-isolation.spec.ts > RES-243: forge via SET LOCAL`, `via RESET`                        |
| `withoutTenant` → `withTenantId` drift caught         | `tenant-isolation.spec.ts > RES-243: binding a tenant inside withoutTenant`                   |
| `withoutTenant` → `withTenant` throws (ALS not bound) | `tenant-isolation.spec.ts > RES-238: withoutTenant nesting withTenant throws (ALS not bound)` |
| `withTenant` callback resolving after setTimeout      | `tenant-isolation.spec.ts > RES-238: withTenant holds tx open across setTimeout`              |
| ScopedTx auto-filter / auto-inject / auto-update      | `scoped-tx.spec.ts` — multiple                                                                |

## Conventions

### Tables

- **`tenant_id` is the first column** in every domain table after `id`.
- **Indexes lead with `tenant_id`** — even unique indexes for slugs.
  Postgres planner picks the index when the query filters by tenant_id,
  which it always does after RLS injection.
- **No hard deletes.** Soft-delete via `archived_at timestamptz`. Audit
  history depends on rows surviving.
- **Foreign keys to other tenant-scoped tables** must use `ON DELETE
CASCADE` from the tenant-owner side (deleting a tenant deletes its
  menu) and `ON DELETE RESTRICT` for cross-domain references inside the
  tenant (deleting a category errors if items still reference it).

### Money

Always `numeric(12, 2)` via the `money` custom type. Never
`double precision`, never JS `number`. Currency is a separate `text`
column constrained to ISO-4217 (`^[A-Z]{3}$`).

### Localized strings

`jsonb` typed as `LocalizedText` — `{ en: 'Pizza', ru: 'Пицца' }`. Render
fallback rules live in `@resto/domain`.

### Slugs

Lowercase ASCII, hyphen-separated, no leading/trailing hyphen — checked
by a `~ '^[a-z0-9][a-z0-9-]*$'` constraint per table. Stored as `text`
or `citext` depending on whether case-insensitive uniqueness is needed.

## Adding a new tenant-scoped table

1. Add the schema file under `src/schema/<name>.ts`. Use
   `pkUuid()`, `tenantIdColumn()`, `timestampsColumns()` from
   `_columns.ts` for the standard fields.
2. Re-export from `src/schema/index.ts`.
3. `pnpm db:generate --name=add_<thing>` to produce a forward migration.
4. Add a follow-up RLS migration via `pnpm db:generate --custom
--name=<thing>_rls`. Mirror the policies in
   `migrations/0001_rls_policies.sql` for consistency.
5. Add an integration test asserting cross-tenant isolation on the new
   table.

## Migrations

- **Forward-only.** Rollbacks are paired forward migrations
  (`0023_add_x.sql`, `0024_revert_x.sql`).
- **Run via `pnpm db:migrate`**, never inline at app startup.
- **In Kubernetes** — run as a `Job` ahead of app rollout. The Job uses
  the same image as the api so it picks up the latest migrations.

## Testing

- **Unit tests** (`test/unit/`) — fast, no Docker.
- **Integration tests** (`test/integration/`) — require Docker; the
  suite skips with a clear warning if Docker is not available. Run
  `colima start` or open Docker Desktop before iterating on the
  database layer.

```bash
pnpm exec nx run db:typecheck
pnpm exec nx run db:lint
pnpm exec nx run db:test
```

## References

- [ADR-0003 — Drizzle on Postgres](../../docs/adr/0003-drizzle-orm-on-postgres.md)
- [ADR-0006 — multi-tenancy via row-level + RLS](../../docs/adr/0006-multi-tenancy-row-level-with-rls.md)
- [ADR-0010 — MVP-1 scope](../../docs/adr/0010-mvp-1-scope.md)
