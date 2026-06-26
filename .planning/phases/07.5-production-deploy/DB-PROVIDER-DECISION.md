# DB-PROVIDER-DECISION: AWS RDS for PostgreSQL

**Status:** LOCKED  
**Decision ID:** D-04  
**Locked by:** Founder (maks_p), 2026-06-26  
**Neon declined:** Yes — see rationale below.  
**Consumed by:** Plans 06 (provisioning), 08 (secret injection), and every plan that runs migrations or references `DATABASE_URL` / `DATABASE_DIRECT_URL`.

---

## Decision

Production database is **AWS RDS for PostgreSQL**.

---

## Rationale

| Factor                             | AWS RDS                                                                                                                                                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **AWS-native**                     | Same account as the ECS/Fargate hosting surface — no cross-cloud egress, IAM policies apply uniformly, VPC security groups scope DB access to the ECS task role without a public endpoint                                                                                                                          |
| **Fully managed**                  | Automated daily backups, point-in-time recovery (PITR), patching, and durable EBS-backed storage — no manual backup scripts                                                                                                                                                                                        |
| **No serverless-Postgres lock-in** | RDS runs standard Postgres; no proprietary extensions or connection proxy required for correctness. The RestOS tenant-isolation model (FORCE RLS + 3-role) works on any standards-compliant Postgres, and RDS is commodity Postgres                                                                                |
| **Neon declined**                  | Neon's serverless model creates a pooler footgun on the session-pinned advisory lock (`pg_try_advisory_lock(4815115)`) used by the outbox leader-election. The `DATABASE_DIRECT_URL` workaround exists in code but adds accidental complexity at first-customer volume. RDS avoids this category of issue entirely |

---

## 3-Role Model on RDS

RestOS requires three Postgres roles, each with distinct privilege and RLS attributes. The role names below are the canonical names used in `packages/db/sql/roles.sql`, `packages/db/sql/auth-role.sql`, and `packages/db/src/roles.ts` / `packages/db/src/auth-role.ts`.

Every tenant-scoped table is created with:

```sql
ENABLE ROW LEVEL SECURITY;
FORCE ROW LEVEL SECURITY;
```

`FORCE ROW LEVEL SECURITY` means the table owner is also subject to RLS policies, closing the owner-bypass that plain `ENABLE ROW LEVEL SECURITY` leaves open.

### Role 1: `resto_app` — runtime application role (NOBYPASSRLS)

- **Used by:** the NestJS API request path (`DATABASE_URL`)
- **RLS attributes:** `NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB`
- **Verified at boot:** `assertNoRlsBypass` in `packages/db/src/preflight.ts` reads `pg_roles.rolsuper` AND `pg_roles.rolbypassrls` for the connected user and throws `RlsBypassError` if either is true — boot aborts if wrong credentials are supplied
- **Grants (from `roles.sql`):**
  - `GRANT USAGE ON SCHEMA public`
  - `GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public` — DELETE intentionally omitted (hard deletes are forbidden; soft-delete via `archived_at`)
  - `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public`
  - `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public`
  - `GRANT EXECUTE ON FUNCTION app_bind_tenant(text, boolean)` — the SECURITY DEFINER GUC wrapper; the only path to bind `app.current_tenant` (RES-243)
  - `GRANT DELETE ON inbox_processed` — inbox retention sweep only
  - `GRANT DELETE ON menu_stop_list` — stop-list unstop
  - `GRANT DELETE ON menu_item_modifier_groups` — modifier-group replace
  - `REVOKE SELECT, INSERT, UPDATE, DELETE ON account, two_factor, verification, session` — Better Auth credential tables are `resto_auth`-only (RES-206, ADR-0013)
- **Default privileges:** future tables/sequences/functions created by the migration role inherit the same grants automatically

### Role 2: `resto_admin` — migration / schema-owner role (DDL + CREATEROLE)

- **Used by:** `pnpm db:migrate` (`DATABASE_ADMIN_URL`); must not be the runtime connection
- **RLS attributes:** `NOSUPERUSER NOBYPASSRLS CREATEROLE CREATEDB` (or equivalent schema-owner grant; exact attributes set by `provisionAppRole` in `packages/db/src/roles.ts`)
- **Responsibilities:** owns all DDL — `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`, `CREATE EXTENSION`, running Drizzle-generated migrations; also runs `roles.sql` and `auth-role.sql` to re-grant after each migration
- **Extensions to install:** `pgcrypto`, `citext`, `pg_trgm` — all three are on the [Amazon RDS supported PostgreSQL extensions list](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html#PostgreSQL.Concepts.General.FeatureSupport.Extensions); installation requires the migration role to hold `CREATE EXTENSION` privilege (granted by `rds_superuser` at provisioning)
- **Note on name:** the role is referenced as `resto_admin` in code comments and runbooks. The name used in `provisionAppRole` / `migrate.ts` is the concrete value; plan 06 provisioning confirms the exact name against the committed code before proceeding

### Role 3: `resto_auth` — Better Auth role (BYPASSRLS)

- **Used by:** Better Auth session lookups and auth mutations (ADR-0013)
- **RLS attributes:** `NOSUPERUSER BYPASSRLS NOCREATEROLE NOCREATEDB`
- **Why BYPASSRLS:** Better Auth's session/account/user tables carry no `tenant_id` column (they are cross-tenant identity primitives); RLS policies for these tables would be vacuous or actively harmful. Granting `BYPASSRLS` restricts the bypass to this single purpose-built role with the smallest possible grant surface (see below)
- **Grants (from `auth-role.sql`):**
  - Leading `REVOKE ALL` clears any prior broad grants
  - `GRANT USAGE ON SCHEMA public`
  - `GRANT SELECT, INSERT, UPDATE, DELETE ON "user", session, account, verification, two_factor, member, invitation, organization_role`
  - `GRANT SELECT, UPDATE ON tenants` — BA's "organization" mapping; INSERT/DELETE stay with the tenancy bounded context
  - No access to any other table — this is enforced by the leading REVOKE plus `DEFAULT PRIVILEGES` revoke
- **Verified at boot:** `assertNoBaCredentialAccess` checks that `resto_app` holds zero privileges on `account`, `session`, `two_factor`, `verification` (defense-in-depth: the correct division is that `resto_auth` holds these, not `resto_app`)

### Boot preflight summary

At every production boot, `apps/api/src/main.ts` runs these checks before serving traffic:

| Check                                        | What it asserts                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `assertNoRlsBypass`                          | `resto_app` connection is `NOSUPERUSER NOBYPASSRLS`                                   |
| `assertTenantLockInstalled`                  | `app_bind_tenant(text,boolean)` exists and `resto_app` holds EXECUTE                  |
| `assertSetConfigRevoked`                     | `resto_app` cannot call `pg_catalog.set_config(text,text,boolean)` directly (RES-243) |
| `assertNoBaCredentialAccess`                 | `resto_app` holds zero privileges on the 4 BA credential tables                       |
| `assertInboxProcessedDeletable`              | `resto_app` holds DELETE on `inbox_processed` (inbox retention sweep)                 |
| `assertWithoutTenantCallsiteRegistered`      | every `withoutTenant` bypass call resolves to a registered file on disk               |
| `assertRoleAttributes` (inside provisioning) | actual `pg_roles` attributes match expected values for each provisioned role          |

---

## Connection Model (D-05 — RDS-simplified)

| Variable              | Usage                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`        | Application request path — `resto_app` role; pooled or direct, resolved per instance                                                                                                                                                             |
| `DATABASE_DIRECT_URL` | Outbox dispatcher leader election — `pg_try_advisory_lock(4815115)` requires a **session-pinned** connection that must not be returned to a pool mid-session; already wired in code (`apps/api/src/infrastructure/outbox-dispatcher.service.ts`) |
| `DATABASE_ADMIN_URL`  | Migration runs only (`pnpm db:migrate`); `resto_admin` role; never the runtime connection                                                                                                                                                        |

**RDS has no built-in connection pooler.** At first-customer volume, `DATABASE_URL` and `DATABASE_DIRECT_URL` may be equal — both point directly at the RDS endpoint. The `DIRECT_URL` separation already present in code means switching to **RDS Proxy** later (if connection counts demand it) is a one-variable change: set `DATABASE_URL` to the proxy endpoint and leave `DATABASE_DIRECT_URL` pointing at the RDS direct endpoint. No code changes required.

The Neon/PgBouncer pooler footgun (transaction-mode pooler breaking session-pinned advisory locks) does not apply to RDS, but the `DATABASE_DIRECT_URL` separation is kept because:

1. It correctly expresses the intent (one path needs session semantics)
2. RDS Proxy can be added transparently later

---

## Open Item — BYPASSRLS on RDS (plan 06 HARD-STOP)

> **OPEN — confirm at provisioning (plan 06):** On RDS the master account is `rds_superuser`, not a true PostgreSQL `SUPERUSER`. Granting `BYPASSRLS` on another role normally requires `SUPERUSER`. The question is whether `rds_superuser` can confer `BYPASSRLS` on `resto_auth`.
>
> According to AWS documentation, `rds_superuser` is a pre-defined role with most superuser privileges, including the ability to grant `BYPASSRLS` to other roles. Confirm this empirically against the real RDS instance in plan 06 by running `provisionAuthRole` and then querying `pg_roles` to verify `rolbypassrls = true` on `resto_auth`.
>
> **If `rds_superuser` cannot confer `BYPASSRLS` on `resto_auth`, plan 06 HARD-STOPS.** We then revisit options:
>
> - An RDS-specific role workaround (e.g. a SECURITY DEFINER function owned by a superuser-equivalent)
> - A different RDS configuration parameter
> - Revisiting the provider choice
>
> This is the single empirical confirmation required before production provisioning proceeds. No throwaway-DB spike is run — the real instance is the test.

---

## Extensions

The following PostgreSQL extensions are required and are confirmed as supported by Amazon RDS for PostgreSQL:

| Extension  | Used for                                                                               |
| ---------- | -------------------------------------------------------------------------------------- |
| `pgcrypto` | Password hashing utilities; presence checked by `packages/db/src/preflight.ts` at boot |
| `citext`   | Case-insensitive text columns (email uniqueness)                                       |
| `pg_trgm`  | Trigram indexes for menu-item search                                                   |

Installation is performed by the `resto_admin` role during database setup (plan 06), using the same `CREATE EXTENSION IF NOT EXISTS` pattern as `infra/docker/postgres/init/01-extensions.sql`.

---

## What this decision is NOT

- No live database was provisioned in this plan
- No SQL was run against any instance
- No cloud credentials are required to record this decision
- The empirical BYPASSRLS confirmation runs exactly once, against the real RDS instance, in plan 06

---

_Locked: 2026-06-26 | Phase: 07.5-production-deploy | Plan: 07.5-01_
