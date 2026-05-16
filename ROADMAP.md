# RestOS Roadmap

## Current state

- **Active milestone:** MVP-2 (Phase D — customer phone+OTP mobile flow, not yet started)
- **Last shipped:** MVP-1 (per [ADR-0010](./docs/adr/0010-mvp-1-scope.md))
- **Open technical debt:** [.planning/reviews/2026-05-16-full-codebase/INDEX.md](./.planning/reviews/2026-05-16-full-codebase/INDEX.md) — 34 P0/P1 from the 2026-05-16 full-codebase review

## MVP-1 — done

Per [ADR-0010](./docs/adr/0010-mvp-1-scope.md). Scope:

- Bounded contexts: tenancy, identity (placeholder), catalog
- Apps: qr-menu (read-only), landing page
- Tenant onboarding via CLI/seed scripts in `tools/scripts/`
- Menu management via direct DB seeding by Resto team for design partners
- Tenant isolation verified at application layer and Postgres RLS layer
- Observability: traces in Jaeger (dev) / Tempo (prod) for every qr-menu request, errors in Sentry

Foundation ADRs: [ADR-0001](./docs/adr/0001-modular-monolith-with-ddd.md) (modular monolith + DDD), [ADR-0002](./docs/adr/0002-nestjs-as-backend-framework.md) (NestJS), [ADR-0003](./docs/adr/0003-drizzle-orm-on-postgres.md) (Drizzle + Postgres), [ADR-0004](./docs/adr/0004-nats-jetstream-event-bus.md) (NATS JetStream), [ADR-0006](./docs/adr/0006-multi-tenancy-row-level-with-rls.md) (RLS multi-tenancy), [ADR-0007](./docs/adr/0007-nx-pnpm-monorepo.md) (Nx + pnpm).

## MVP-2 — active

Identity, admin UI, multi-brand under tenant. Per [ADR-0013](./docs/adr/0013-better-auth-for-mvp2-identity.md) (supersedes ADR-0005 and ADR-0012) and [ADR-0019](./docs/adr/0019-multi-brand-under-tenant.md).

### Phase A — identity foundation: done

Per ADR-0013 Phase A. BA schema, two-role provisioning, RBAC catalogue, smoke test. Evidence: `auth.config.ts`, `drizzle-adapter.ts`, `access-control.ts` all present with full Better Auth configuration and RBAC catalogue.

### Phase B — identity guards + bootstrap: done

AuthGuard, brand-scope guard, signup flow, internal bootstrap controller. Evidence: `auth.guard.ts`, `brand-scope.guard.ts`, `signup.controller.ts`, and `internal-bootstrap.controller.ts` all present and exercised by unit + e2e tests.

### Phase C — admin UI integration: done

Per [ADR-0016](./docs/adr/0016-admin-app-stack.md) (Next.js 15 + shadcn). Evidence: 53 TSX files shipped covering login, signup, dashboard, brand management, settings, and onboarding flows.

### Phase D — customer phone+OTP (mobile): planned

Per ADR-0013 Phase D. Expo + Better Auth `phoneNumber` plugin. Evidence: `apps/mobile/` is a `.gitkeep` stub only; no OTP implementation found in codebase.

### Phase E — BA hooks + audit pipeline: done

Per ADR-0013 Phase E. Evidence: `hooks.before` and `hooks.after` middleware wired in `auth.config.ts` with identity event emission and audit pipeline via outbox.

### Phase F — security tests + hardening: done

Per ADR-0013 Phase F. Evidence: `security.e2e.spec.ts` (205 lines) shipped; RES-200 (`test(security): per-email reset throttle fires under rotated IPs`), RES-194 (gate Swagger to dev/test only), RES-189 (per-bucket rate-limit for signup) all merged to main.

### Cross-cutting

- [ADR-0019](./docs/adr/0019-multi-brand-under-tenant.md) — multi-brand under tenant
- [ADR-0017](./docs/adr/0017-defer-otel-collector-to-mvp-2.md) — OTel collector deferred until MVP-2
- [ADR-0018](./docs/adr/0018-gdpr-tenant-offboarding.md) — GDPR tenant offboarding

## Backlog

### ADR-0020 enforcement (high priority)

[ADR-0020](./docs/adr/0020-multi-tenancy-and-event-bus-invariants.md) defines 7 multi-tenancy + event-bus invariants. Enforcement is technical debt:

- 12 P0 + ~30 P1 violations catalogued in [.planning/reviews/2026-05-16-full-codebase/INDEX.md](./.planning/reviews/2026-05-16-full-codebase/INDEX.md).
- Convert to a GSD milestone via `gsd-new-milestone` when ready (separate decision; see "Out of scope" in the bootstrap spec).
- The CI lints described in ADR-0020 (per-invariant) are prerequisite infrastructure — they land first, then per-invariant fixes.

### Other (post-MVP-2 or unstarted)

- Mobile customer app (Expo) — scaffold only, not started; tracked under ADR-0013 Phase D.
- Tenant marketing website (Next.js multi-tenant) — scaffold only.
- Loyalty, inventory, analytics — post-MVP-2 contexts, no ADR yet.

## Cross-refs

- Architecture decisions: [`docs/adr/`](./docs/adr/) — authoritative.
- Tactical reviews: [`.planning/reviews/`](./.planning/reviews/) — ephemeral (gitignored).
- This roadmap: maintained manually, derived from ADRs. Refresh after every new ADR or after a phase ships.
