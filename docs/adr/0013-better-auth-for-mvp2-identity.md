# ADR 0013: Better Auth for MVP-2 identity

- **Status:** accepted
- **Date:** 2026-05-02
- **Supersedes:** [ADR 0012](./0012-defer-identity-to-mvp-2.md)
- **Revises:** [ADR 0005](./0005-keycloak-self-hosted-identity.md)
- **Deciders:** Resto core team

## Context

ADR-0012 deferred identity to MVP-2 because MVP-1 had no admin UI and a
purely anonymous customer surface. MVP-2 changes both inputs:

- Admin UI ships with MVP-2 → operators need email+password login on
  `admin.resto.app`.
- Customer mobile (Expo/RN) ships with MVP-2 → customers log in via
  phone+OTP on a per-tenant white-label app.

ADR-0005's matrix (Keycloak vs Ory vs FusionAuth vs managed) was scoped
to operator-side only. Customer phone+OTP changes the matrix in a
non-trivial way — Keycloak's lack of native phone+OTP becomes a deciding
constraint.

## Decision

Adopt **Better Auth** (~1.3, MIT-OSS) as the identity engine for MVP-2.

Better Auth runs in-process inside `apps/api` (NestJS + Fastify). It is
mounted at `/api/auth/*` via a Fastify ↔ Web Request bridge. Its
Drizzle adapter writes to the same Postgres our domain uses; BA's
`organization` concept is mapped onto our existing `tenants` table.

**Two Postgres roles, hybrid RLS:**

- `resto_app` — `NOBYPASSRLS` runtime role for the rest of the
  application. Bound by RLS to `current_tenant_id()`.
- `resto_auth` — `BYPASSRLS` role used exclusively by Better Auth's
  drizzle client. Required because BA's organization plugin
  legitimately reads cross-tenant member/invitation data during admin
  operations (e.g., listing all members of an organization for the
  invite flow). Provisioned by `packages/db/sql/auth-role.sql`.

**Multi-tier RBAC:**

- Three immutable system roles (`owner`, `admin`, `staff`) defined in
  code via `ac.newRole`.
- Tenant-creatable roles persisted in BA's `organization_role` table,
  enabled by `dynamicAccessControl: { enabled: true }`. BA enforces
  "cannot grant permissions you do not have" — that is the safety
  ceiling for Phase A.

**Authentication flows:**

- Operator: email + password on admin web (HttpOnly cookie session,
  `cookieDomain` configurable per env). Optional TOTP MFA.
- Customer: phone + OTP on mobile (Bearer token, stored in
  `expo-secure-store`). Wired in Phase D — BA's `phoneNumber` plugin
  with `signUpOnVerification.getTempEmail`.

Session model: opaque DB-backed sessions, 7-day expiry with 1-day
rolling renewal. No JWT plugin (mgmt simplicity, instant revocation).

## Alternatives considered

- **Keycloak (ADR-0005's choice).** Rejected. Phone+OTP is not native
  in Keycloak; it requires either a community Java SPI plugin or a
  custom SPI we cannot maintain (no Java in the team). ADR-0012 also
  documented operational weight that recurs if we re-adopt Keycloak.
- **Ory Kratos.** Rejected on stack-fit grounds. Kratos is a separate
  Go service with no end-to-end TS types. We would write our own
  types or generate from OpenAPI; we would maintain a `+1` deployment
  unit. Audited and mature, but trade-off lands wrong for an early-
  stage TS-monorepo team.
- **FusionAuth.** Rejected: closed-source vendor, lock-in
  proportional to feature use.
- **DIY identity layer.** Rejected per ADR-0005's "identity is too
  important to roll your own." Our scope is small enough that a
  primitive-stitched solution is feasible (argon2id + jose + otplib +
  custom tables, ~2000 LOC), but the cost of correctly closing every
  edge case (email enumeration timing, refresh-token reuse,
  account-lockout race, OTP race, CSRF) is real and ongoing without
  a dedicated security engineer.
- **Managed (Auth0, Clerk, WorkOS, Supabase Auth).** Rejected per
  the project rule "no BaaS shortcuts" — explicit non-goal for Resto.

## Consequences

### Positive

- Zero additional deployment unit, no extra container, no extra
  Postgres database. BA reuses our Postgres via Drizzle adapter (with
  a separate role for RLS isolation).
- TypeScript types flow end-to-end into `@resto/api-client`,
  consumed by `apps/admin` and `apps/mobile`.
- Phone+OTP first-class via `phoneNumber` plugin (Phase D);
  multi-tenancy first-class via `organization` plugin; multi-tier
  RBAC via `dynamicAccessControl`.
- Faster initial implementation than Keycloak/Kratos: no realm seed,
  no plugin SPI to write, no separate process to operate.

### Negative

- Better Auth is ~2 years old. The seed funding ($5M, 2024) lifts the
  prior single-maintainer concern but does not erase the immaturity
  vs decade-old IdPs. Hedge: pin major version, audit every minor
  release, document an exit plan.
- No public independent security audit at adoption time. Hedge:
  internal threat model + targeted security tests (timing
  enumeration, brute force, OTP race) in Phase F. Revisit if/when BA
  publishes an audit report.
- VC funding raises monetization-pressure risk: features could
  migrate from OSS core to paid `@better-auth/infra` over time.
  Hedge: do NOT adopt `@better-auth/infra` (`dash`, `sentinel`).
  Replicate locally with our own infra (audit table, Redis rate-
  limit, AWS WAF). If a hard breaking move occurs we can fork.
- Schema lock-in to BA tables (`user`, `session`, `account`, ...)
  exists. Hedge: ports/adapters keep BA-specific code isolated to
  `apps/api/src/contexts/identity/infrastructure/better-auth/`;
  domain code never imports BA. Migration to Kratos or alternative
  in the worst case = rewrite ~5 adapter files; ~1 sprint.

### Neutral

- The `users` table introduced in MVP-1 (with `keycloak_subject`)
  had no production rows and is dropped in migration 0004. No data
  migration needed.
- ADR-0005 remains a useful historical document of the
  operator-only identity matrix. ADR-0013 explicitly revises it to
  account for customer-side phone+OTP requirements that did not
  exist when 0005 was written.

## Hedging conditions (mandatory for adoption)

1. Pin Better Auth major version (`~1.3` in `package.json`); upgrades
   only via reviewed PR with changelog read.
2. Do NOT adopt `@better-auth/infra` (`dash`, `sentinel`, managed
   audit/SMS/email/KV). Use our own infra.
3. Audit-trail goes to our `audit_log` table via BA event hooks
   (Phase E), not via `dash()`.
4. Rate-limiting and lockout in our code on Redis (per-phone /
   per-IP) and at AWS WAF (edge), not via `sentinel()`.
5. Ports/adapters exit isolation: `IdentityRepository`,
   `PermissionChecker`, `OtpSender` interfaces in
   `apps/api/src/contexts/identity/application/ports/` (Phase B+).
   BA-specific code lives only in `infrastructure/better-auth/`.

## Hybrid RLS exception

ADR-0006 mandates RLS as second-line defense on tenant-scoped tables.
BA's Drizzle queries do not pass through our `set_config('app.current_tenant', ...)`
mechanism, so naive RLS would break BA. Resolution:

- **RLS enabled** on per-tenant BA tables (`member`, `invitation`,
  `organization_role`) and our `customer_profiles`. Policies key off
  `is_system_session() OR organization_id = current_tenant_id()`.
- **BA connects under `resto_auth` (BYPASSRLS).** This role bypasses
  all RLS policies cleanly; BA's admin operations work as designed.
- **The runtime app role `resto_app` (NOBYPASSRLS) IS bound by these
  policies** and must run inside a tenant-bound transaction
  (`TenantAwareDb.withTenant`).
- **RLS not enabled** on global BA tables (`user`, `session`,
  `account`, `verification`, `two_factor`). Application-layer
  protection: BA's organization plugin scopes member/invitation by
  org; AuthGuard cross-checks `principal.tenantId` against the
  ALS-resolved tenant from `TenantContextMiddleware` (Phase B).

This exception is documented here and accepted by ADR-0013.

## Implementation notes

- Phase A (this ADR) lands the foundation: schema, two-role
  provisioning, BA boot, RBAC catalogue, smoke test. Phases B–F land
  guards, bootstrap, customer phone-OTP flow, hooks, and tests.
- Linear: RES-104 (parent). RES-79 left untouched as historical
  record of the Keycloak placeholder per ADR-0005.
