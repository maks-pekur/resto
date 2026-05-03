# ADR 0006: Multi-tenancy via row-level + Postgres RLS, with dedicated-DB graduation path

- **Status:** accepted
- **Date:** 2026-04-30
- **Revised by:** [ADR 0013](./0013-better-auth-for-mvp2-identity.md) — adds a third Postgres role `resto_auth` (BYPASSRLS) for Better Auth's drizzle adapter; the two-role contract below now reads "three roles" in practice.
- **Deciders:** Resto core team

## Context

Resto serves many tenants from one platform. We need a tenancy model
that:

- Keeps per-tenant isolation strong enough that a bug in the
  application layer cannot leak cross-tenant data.
- Stays operationally cheap as we onboard hundreds of small tenants.
- Allows a few large/enterprise tenants to graduate to dedicated
  databases without re-architecting the application.

## Decision

Default to **row-level multi-tenancy**: every domain table has a
`tenant_id` column, repository helpers in `packages/db` always filter
by it, and Postgres **Row-Level Security (RLS)** policies enforce the
filter at the database layer as defense-in-depth.

Architect for a **dedicated-database tier from day 1**: a tenant
resolver picks the connection pool by tenant id, so promoting a tenant
to its own database is a configuration change, not a code change.

## Alternatives considered

- **Schema-per-tenant.** Strongest argument: stronger isolation than
  shared schema; backup/restore per tenant is trivial. Rejected:
  migration cost scales linearly with tenants (1000 tenants × 1
  migration = 1000 schema migrations); connection-pool fragmentation
  hurts; Postgres `search_path` mistakes are easy to make.
- **Database-per-tenant from day 1.** Strongest argument: hardest
  isolation. Rejected: prohibitive ops cost for a long tail of small
  tenants; we keep this option for the enterprise tier only.
- **Single schema, no RLS, application-only filtering.** Strongest
  argument: simplest. Rejected: a single forgotten `where` clause
  leaks every tenant's data — unacceptable risk.

## Consequences

### Positive

- One schema, one migration cadence — simple ops for the common case.
- RLS at the DB is a hard backstop against application bugs.
- The dedicated-DB tier is available without re-architecting; we
  switch the connection pool, run migrations against the new DB, and
  copy the tenant's data.

### Negative

- Cross-tenant queries (analytics across tenants, ops dashboards) need
  a dedicated read path that bypasses the per-tenant connection — we
  will isolate that in a separate "platform admin" connection with its
  own RLS policy set.
- RLS adds a small per-query overhead; we measure it and accept it.
- The `tenant_id` column appears in every domain table and every index
  must lead with it (or include it). This shapes our schema.

### Neutral

- The `audit` and `notifications` tables are tenant-scoped like the
  rest. Platform-level audit (e.g. tenant provisioning) lives in a
  separate non-tenant-scoped schema.

## Implementation notes

- Tenant context is propagated via `AsyncLocalStorage`; the Drizzle
  client wrapper sets `app.current_tenant` on every connection it
  hands out, and RLS policies reference it via
  `current_setting('app.current_tenant')::uuid`.
- A `withoutTenant()` escape hatch is provided for system code (e.g.
  outbox dispatcher, migrations); using it requires explicit
  authorization and is logged.
- Tenant resolver lives in `apps/api/src/contexts/tenancy/`; it maps
  subdomain or custom domain → tenant id → connection pool.
- **Connection roles.** Postgres superusers and `BYPASSRLS` roles
  ignore RLS regardless of `FORCE`. Three roles are in play (the third
  added by ADR-0013):
  - `resto_app` (NOSUPERUSER, NOBYPASSRLS) — the runtime app connects
    as this role; RLS enforces tenant isolation.
  - `resto_admin` — schema owner, used by migrations only.
  - `resto_auth` (BYPASSRLS) — Better Auth's drizzle adapter (added by
    ADR-0013). BA's organization plugin legitimately needs
    cross-tenant reads on its own tables; isolation for those tables
    is enforced via BA's session model, not RLS.
    App startup runs `assertNoRlsBypass()` against the `resto_app`
    connection so a misconfiguration fails fast in logs rather than
    silently leaking data. Provisioning, rotation, and provider notes
    live in `docs/runbooks/database-roles.md`.
- Dedicated-DB graduation runbook: `docs/runbooks/graduate-tenant-to-dedicated-db.md`
  (to be written before the first enterprise tenant is provisioned).
