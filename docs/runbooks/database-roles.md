# Runbook: database roles

This runbook covers provisioning, rotating, and extending the two
Postgres roles every Resto database carries:

- `resto_admin` — schema owner. Runs migrations. Effectively a superuser
  within the database. Used only by the migration job; never by the
  long-running application.
- `resto_app` — runtime role. `LOGIN NOSUPERUSER NOBYPASSRLS`, granted
  CRUD on every table plus sequence/function usage. The application
  pool connects as this role.

The split exists because Postgres superusers and `BYPASSRLS` roles
ignore Row-Level Security regardless of `FORCE`. If `apps/api` ever
connects as the admin role, the multi-tenancy layer (ADR-0006)
collapses to "the application is bug-free" — exactly the assumption
RLS exists not to trust.

## When this applies

- Provisioning a fresh database (per-tenant graduation, new
  environment, disaster recovery).
- Rotating `resto_app` credentials.
- Granting privileges for a new feature that introduces tables outside
  `public` or new SQL functions.

The dev stack handles all of this automatically — see
`infra/docker/postgres/init/`. This runbook is the production analogue.

## Canonical SQL

The single source of truth is `packages/db/sql/roles.sql` in this repo.
Every other artifact (test setup, dev init script, this runbook) follows
that file. If you change the privilege grants, update `roles.sql` and
re-run the provisioning step against every existing database.

## 1. Provision a fresh database

Prereqs: a superuser or `CREATEROLE`-capable role on the target
Postgres, plus the `resto_app` password retrieved from Vault /
1Password Connect (never from a checked-in `.env`).

```bash
# Bootstrap user — provided by the managed-Postgres provider.
export ADMIN_URL="postgres://provider_admin:...@host:5432/resto"

# Apply migrations. Uses DATABASE_ADMIN_URL if set, else DATABASE_URL.
DATABASE_ADMIN_URL="$ADMIN_URL" pnpm --filter @resto/db db:migrate

# Provision resto_app. Substitute __APP_PASSWORD__ with the secret
# fetched from Vault — never write the secret to disk.
APP_PASSWORD="$(vault kv get -field=password resto/db/resto_app)"
sed "s/__APP_PASSWORD__/$APP_PASSWORD/g" packages/db/sql/roles.sql \
  | psql "$ADMIN_URL" --set ON_ERROR_STOP=1
```

Verify:

```bash
psql "$ADMIN_URL" -c \
  "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('resto_app');"
# rolname  | rolsuper | rolbypassrls
# resto_app| f        | f
```

## 2. Rotate `resto_app` credentials

The `roles.sql` script is idempotent: re-running it with a new password
replaces the old one. Coordinate with the application rollout so the
running pool drains before the old password stops working.

1. Generate a new password and store it in Vault:
   ```bash
   NEW=$(openssl rand -base64 32)
   vault kv put resto/db/resto_app password="$NEW"
   ```
2. Apply against every database that hosts a Resto tenant:
   ```bash
   sed "s/__APP_PASSWORD__/$NEW/g" packages/db/sql/roles.sql \
     | psql "$ADMIN_URL" --set ON_ERROR_STOP=1
   ```
3. Trigger the application rollout. The new pool reads the secret from
   Vault on boot and reconnects. Old connections keep working until
   they cycle (the old password is no longer valid for _new_ logins
   the moment step 2 finishes).

## 3. Grant privileges for a new feature

If a migration adds a table in a non-`public` schema, or a new SQL
function the runtime needs to invoke:

1. Update `packages/db/sql/roles.sql` with the additional GRANT and
   `ALTER DEFAULT PRIVILEGES` so future migrations stay covered.
2. Apply the updated SQL to every existing database (same `sed | psql`
   pattern as rotation).
3. Add a regression test under
   `packages/db/test/integration/preflight.spec.ts` if the feature
   meaningfully changes the privilege contract.

## 4. Verify a deployment

The `apps/api` startup self-check (see RES-77) calls
`assertNoRlsBypass(DATABASE_URL)` and refuses to start if the
connection has `rolsuper` or `rolbypassrls`. To verify out of band:

```bash
psql "$DATABASE_URL" -c \
  "SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;"
```

Both flags MUST be `f`. If either is `t`, the application is wired to
the wrong credentials — page the on-call and treat as a tenant-data
incident until proven otherwise.

## Provider notes

Some managed-Postgres providers restrict `CREATE ROLE` from the
bootstrap user, or grant `BYPASSRLS` by default to the admin role they
hand you:

- **AWS RDS / Aurora** — bootstrap user has `rds_superuser`, which can
  `CREATE ROLE` but is not a true `SUPERUSER`. `roles.sql` works as-is.
- **Hetzner managed PG** — bootstrap user is a true superuser; `roles.sql`
  works as-is.
- **Supabase** — bootstrap user has `BYPASSRLS`; provisioning works,
  but the bootstrap role itself MUST NOT be reused for the app pool.
- **Cloud SQL (GCP)** — `cloudsqlsuperuser` cannot `ALTER DEFAULT
PRIVILEGES` for arbitrary roles in some configurations. Run the
  `ALTER DEFAULT PRIVILEGES` block as the admin role explicitly.

When evaluating a new provider, the integration test in
`packages/db/test/integration/preflight.spec.ts` is the smoke check:
boot a container, run migrations as admin, provision `resto_app`,
assert the bypass check throws for admin and passes for `resto_app`.

## See also

- ADR-0006 — multi-tenancy via row-level + Postgres RLS
- `packages/db/README.md` — multi-tenancy contract
- `packages/db/sql/roles.sql` — canonical role SQL
