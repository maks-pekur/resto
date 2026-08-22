# @resto/db

## Purpose

Drizzle schema, migrations, RLS policies, repository helpers,
`TenantAwareDb`, role provisioning, CLI tools, preflight checks. The single
place in the monorepo that knows about Postgres.

## Layout

- `src/schema/` — Drizzle table definitions, one file per logical group
  (`tenants`, `menu`, `audit`, `outbox`, `inbox`, `auth`,
  `customer-profiles`). `_columns.ts` / `_types.ts` are shared helpers.
- `src/cli/` — `migrate.ts` and `reset.ts`. Both are operationally
  dangerous; both have hard guards (see Rules below).
- `src/client.ts` + `src/context.ts` — `TenantAwareDb` wiring, ALS bridge,
  `withTenant` / `withoutTenant` wrappers.
- `src/roles.ts` + `src/auth-role.ts` — Postgres role provisioning
  (`resto_app` NOBYPASSRLS, `resto_admin` schema owner, `resto_auth`
  NOBYPASSRLS for Better Auth — reaches BA-owned RLS tables via explicit
  permissive policies (migration 0054, RDS-compatible per D-04)).
- `src/preflight.ts` — startup sanity. `assertNoRlsBypass` runs at boot.
- `migrations/` — Drizzle-generated SQL. Hand-written policy migrations
  (RLS) included.
- `sql/` — static SQL templates (`roles.sql`, `auth-role.sql`) shipped with
  the package; consumed by role provisioning.
- `test/integration/` — runs against a real testcontainer Postgres.

## Workflows

- `pnpm db:generate` — emit migration SQL from schema changes.
- `pnpm db:migrate` — apply migrations (requires `DATABASE_ADMIN_URL` in
  non-dev).
- `pnpm db:reset` — drops and recreates the local schema. Dev only; see
  Rules.
- `pnpm db:audit-fks` (planned, ADR-0020 I-2) — schema audit that prints
  tenant-scoped child tables missing the composite FK.

## Rules

This package owns the implementation of several invariants from
[ADR-0020](../../docs/adr/0020-multi-tenancy-and-event-bus-invariants.md).
The rules below are the concrete shape of those invariants in this package.

### Schema

- **Composite FK on every tenant-scoped child table** (ADR-0020 I-2).
  Child carries `tenant_id NOT NULL` AND a parent `*_id` →
  `FOREIGN KEY (parent_id, tenant_id) REFERENCES parent(id, tenant_id)`.
  Requires the parent to expose `UNIQUE (id, tenant_id)` — cheap, `id` is
  already PK. Without this, `tenant_id` on the child is value-only and
  cross-tenant phantom rows are possible.
- **Every tenant-scoped table has RLS enabled + FORCED.** `ENABLE ROW
LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` in the migration. Owner +
  superuser bypasses are disallowed at the connection level (`resto_app`
  is NOBYPASSRLS); `assertNoRlsBypass` enforces this at boot.
- **`outbox_events` is intentionally NOT RLS-scoped on SELECT** (the
  dispatcher needs cross-tenant scan) but writes MUST include `tenant_id`
  where applicable. Inserts go through `appendToOutbox` in `@resto/events`.
- **`inbox_processed` has the `(event_id, consumer)` PK as idempotency
  key + a `processed_at` timestamp.** Retention sweep job is documented
  in the runbook (planned); the table grows unbounded otherwise.
- **`_columns.ts` is the only place that constructs `tenant_id` columns.**
  `tenantIdColumn()` (notNull, FK to `tenants.id` with explicit
  `onDelete` policy) ensures the column shape is uniform. Comment in
  `_columns.ts` must match the actual `onDelete` behaviour declared at
  the FK site (current `cascade` vs documented `restrict` is tech debt;
  fix is to standardise on `restrict` and force erasure via the explicit
  `tenancy_erase_tenant` SQL function).

### Repository / read-write

- **Repo-layer tenant filter is mandatory ON TOP of RLS** (ADR-0020 I-1).
  Every `tx.select().from(<tenant-scoped table>)` MUST include
  `eq(table.tenantId, ctx.tenantId)`. RLS is the safety net underneath,
  not the only fence.
- **`withTenant` callback must not re-bind `app.current_tenant`.** Calling
  `tx.execute(sql\`SELECT set_config('app.current_tenant', '...', true)\`)`inside the callback is a tenant-escalation primitive. Until`set_config`is revoked from`resto_app`(planned), reviewers reject any code that
calls`set_config`outside`client.ts`.
- **`withoutTenant` requires a non-empty `reason` argument.** Bypass is
  auditable; logs include the reason.
- **No raw SQL outside this package.** Hand-written queries elsewhere
  bypass the type-safety net.

### CLI

- **`db:reset` runs only when `NODE_ENV ∈ {development, test}` AND
  `RESTO_CONFIRM_RESET=yes-wipe-my-dev-db`.** Anything else — unset,
  `prod`, `live`, typo, missing env — exits with a clear error. Default
  fallback `development` from the env schema does NOT count as set.
  Additionally, the resolved DB host must be `localhost` / `127.0.0.1` /
  `postgres` (docker hostname); production hostnames are refused.
- **`db:migrate` requires `DATABASE_ADMIN_URL` explicitly in non-dev — no
  fallback to `DATABASE_URL`.** Migrating under the `resto_app` role
  fails partway with permission errors and leaves the schema in a
  half-migrated state; we'd rather fail fast at the URL-check.

### Preflight

- **`preflight.ts` asserts required Postgres extensions exist** (`citext`,
  `pgcrypto`). A backup-restore that drops extensions silently breaks
  every write at runtime with cryptic errors — preflight catches it at
  boot.
- **`assertNoRlsBypass` checks `pg_roles.rolsuper` AND `rolbypassrls`** on
  the `resto_app` connection. Fail-closed: any misconfiguration aborts
  boot.

### Role provisioning

- **`provisionAppRole` / `provisionAuthRole` validate the password against
  a strict allowlist (printable ASCII, no `'`, `"`, `\`, `;`, `--`, `/*`).**
  Filtering only `'` is incomplete; newlines + `--` allow injecting an
  entire `ALTER ROLE … SUPERUSER` after the password line because the
  template is run via `client.unsafe(sqlText)`. The migration path is to
  switch to parameterised `ALTER ROLE … PASSWORD $1` and keep the rest of
  `roles.sql` as static DDL.
- **`resto_auth` is NOBYPASSRLS.** `provisionAuthRole` creates/alters it as
  `NOSUPERUSER NOBYPASSRLS` and applies the permissive RLS policies from
  migration 0054 (idempotent DO $$ blocks in `sql/auth-role.sql`). This
  replaces the former `BYPASSRLS` attribute (ADR-0013 original mechanism)
  which RDS cannot confer on a non-superuser. Table access is now policy-based:
  `CREATE POLICY ... FOR ALL TO resto_auth USING(true)` on member, invitation,
  tenant_role, and tenants — scoped TO resto_auth only, not affecting
  `resto_app`'s tenant isolation. `assertAuthRoleNoBypass(adminUrl)` in
  `src/preflight.ts` verifies this for runbook/plan-06 dry-checks.

### Logger

- **`logger.ts` has a `redact` config covering `password`, `token`,
  `email`, `phone`, `params`.** Drizzle's query logger (currently
  disabled) would otherwise emit SQL params verbatim including PII. The
  redaction is defensive — it must work even if someone re-enables the
  logger by accident.

### Tests

- **`test/integration/tenant-isolation.spec.ts`** is the canonical
  regression net for RLS. Every new tenant-scoped table needs an entry
  here. Cross-tenant SELECT must return zero rows; cross-tenant INSERT
  with mismatched `app.current_tenant` must error.
- **`packages/db/vitest.config.ts` MUST NOT exclude `src/cli/**` from
coverage.** Safety-critical scripts (`reset.ts`, `migrate.ts`) get
unit tests that stub `process.exit`and assert behaviour for`NODE_ENV`in`{undefined, 'prod', 'production', 'development', 'test'}`.

## MCP

- **Linear** for `RES-<n>` ticket lookups on db-related work.
- **Context7** for current Drizzle / Postgres docs.
