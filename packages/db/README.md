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
