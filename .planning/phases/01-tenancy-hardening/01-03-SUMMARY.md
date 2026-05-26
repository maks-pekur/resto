---
phase: 01-tenancy-hardening
plan: 03
subsystem: tenancy
tags:
  [
    tenancy,
    suspend,
    resume,
    aggregate,
    domain-events,
    correlation-id,
    build-envelope,
    cron,
    background-jobs,
    inbox-retention,
    erasure,
    openapi,
  ]

requires:
  - phase: 01-01
    provides: hardened outbox (idempotent stop, envelope validation at boundary)
provides:
  - Tenant.suspend()/resume() aggregate methods + domain events + domain errors (403/409 mapping)
  - SuspendTenantService + internal HTTP routes POST /internal/v1/tenants/:id/{suspend,resume}
  - buildEnvelope helper reading correlationId from ALS with randomUUID()+WARN fallback (D-10)
  - TenantSuspendedV1 / TenantResumedV1 event contracts wired through outbox
  - RequireActiveTenantGuard + @RequireActiveTenant() decorator — blocks suspended-tenant traffic on public menu routes (403)
  - Migration 0028 — narrow GRANT DELETE on inbox_processed only (OQ-2)
  - inbox-retention helper (db.withoutTenant) added to WITHOUT_TENANT_ALLOWLIST (now 8 entries)
  - BackgroundJobsModule hosting ScheduleModule.forRoot() + TenantErasureSchedulerService (0 2 * * *) + InboxRetentionService (15 2 * * *) — both UTC, sequential per-iteration with try/catch + OTel error span (D-11)
  - Regenerated docs/api/openapi.yaml
affects: [01-04, 01-05, 01-06]

tech-stack:
  added:
    - '@nestjs/schedule@=4.1.2 (exact pin)'
    - 'pino@^9.5.0 (now a direct dep of @resto/events)'
  patterns:
    - 'Aggregate state transitions emit typed domain events + throw guard errors (active↔suspended)'
    - 'buildEnvelope() consumes correlationId from AsyncLocalStorage; literal randomUUID() forbidden in new code (TEN-15)'
    - "Cron services: sequential loop with per-iteration try/catch + OTel error span — one tenant's failure never blocks the rest (D-11)"
    - 'Public-route guard mapping inline (ProblemDetailsFilter does not call mapDomainError for guards)'

key-files:
  created:
    - apps/api/src/contexts/tenancy/application/suspend-tenant.service.ts
    - apps/api/src/contexts/tenancy/application/dto.ts (SuspendTenantInputDto, ResumeTenantInputDto)
    - apps/api/src/shared/auth/require-active-tenant.decorator.ts
    - apps/api/src/shared/auth/require-active-tenant.guard.ts
    - apps/api/src/infrastructure/background-jobs.module.ts
    - apps/api/src/infrastructure/tenant-erasure-scheduler.service.ts
    - apps/api/src/infrastructure/inbox-retention.service.ts
    - packages/db/src/inbox-retention.ts
    - packages/db/migrations/0028_grant_delete_inbox_processed.sql
    - packages/events/src/build-envelope.ts
    - apps/api/test/unit/tenancy/tenant-aggregate-suspend.spec.ts
    - apps/api/test/e2e/tenancy-suspend.e2e.spec.ts
    - apps/api/test/e2e/background-jobs.e2e.spec.ts
    - packages/events/test/unit/build-envelope.spec.ts
  modified:
    - apps/api/src/contexts/tenancy/domain/tenant.aggregate.ts
    - apps/api/src/contexts/tenancy/domain/events.ts
    - apps/api/src/contexts/tenancy/domain/errors.ts
    - apps/api/src/contexts/tenancy/interfaces/http/internal-tenants.controller.ts
    - apps/api/src/contexts/tenancy/interfaces/http/error-mapping.ts
    - apps/api/src/contexts/tenancy/tenancy.module.ts (exports TENANT_REPOSITORY)
    - apps/api/src/contexts/catalog/catalog.module.ts (imports TenancyModule)
    - apps/api/src/contexts/catalog/interfaces/http/public-menu.controller.ts
    - apps/api/src/contexts/audit/application/record-audit.service.ts
    - apps/api/src/app.module.ts (registers BackgroundJobsModule)
    - packages/events/src/index.ts (exports buildEnvelope, BuildEnvelopeOptions, tenant suspend/resume contracts)
    - packages/events/src/contracts/tenancy.ts (TenantSuspendedV1, TenantResumedV1)
    - packages/events/src/domain-event-to-envelope.ts (case branches for new events)
    - packages/db/src/withoutTenant.allowlist.ts (8 entries now)
    - packages/db/test/unit/withoutTenant-allowlist.spec.ts (count → 8)
    - docs/api/openapi.yaml (regenerated)

key-decisions:
  - 'OQ-1: TenantSuspendedError maps to 403 (not 401/410). The tenant exists and the caller is authenticated; the resource is intentionally unavailable. 403 matches RFC 7231 semantics.'
  - 'OQ-2: Narrow GRANT DELETE on inbox_processed only (not inbox_events) — retention sweep targets the processed table; inbox_events stays append-only with TTL-driven cleanup at the broker tier.'
  - 'OQ-3: Internal /resume route is NOT behind @RequireActiveTenant() — operators must be able to revive suspended tenants, otherwise the suspension is irreversible from the HTTP surface.'
  - 'D-10: buildEnvelope falls back to randomUUID() + WARN log when ALS context is empty rather than throwing — outbox-on-startup must succeed even before any HTTP middleware runs.'
  - "D-11: Cron services iterate sequentially with per-iteration try/catch + OTel error span. One tenant's erasure failure must not block the others."

patterns-established:
  - 'Suspend/Resume aggregate API — state transitions emit typed events; guard errors enforce idempotency'
  - 'RequireActiveTenant guard + decorator — opt-in per controller; missing tenant context bypasses the guard (404 stays in tenant resolution)'
  - 'Single ScheduleModule.forRoot() lives in BackgroundJobsModule — new crons add themselves as providers there, never re-register the module'

requirements-completed:
  - TEN-01
  - TEN-02
  - TEN-03
  - TEN-04
  - TEN-05
  - TEN-06
  - TEN-13
  - TEN-14

duration: 167min
completed: 2026-05-26
---

# Plan 01-03: Tenancy Domain — Suspend/Resume + correlationId Helpers (PR 3) — Summary

Adds the operator surface for suspending and resuming tenants, the audit + outbox plumbing behind it, and the shared `buildEnvelope` helper that future code uses to read `correlationId` from the request-scoped AsyncLocalStorage. Public menu routes gain an opt-in `@RequireActiveTenant()` guard that returns 403 to customers when their tenant is suspended. A new `BackgroundJobsModule` hosts the single `ScheduleModule.forRoot()` instance plus two cron services (tenant erasure sweep + inbox-retention sweep), both UTC, both sequential-with-per-iteration-isolation per D-11.

## Verification

| Command                                              | Result                               |
| ---------------------------------------------------- | ------------------------------------ |
| `pnpm --filter @resto/api exec vitest run test/unit` | PASS — 295/295 in 2.15s              |
| `pnpm --filter @resto/events exec vitest run`        | PASS — 25/25 in 17.55s               |
| `pnpm --filter @resto/db exec vitest run test/unit`  | PASS — 50/50 in 199ms                |
| `pnpm exec nx run-many -t typecheck`                 | PASS — 8/8 projects                  |
| `pnpm --filter @resto/api exec eslint …`             | PASS                                 |
| OpenAPI emit (`scripts/openapi-emit.ts`)             | PASS — 21 paths incl. suspend/resume |

E2E specs are docker-gated; they type-check and lint clean. Local `pnpm db:migrate` was not run end-to-end this session due to pre-existing dev-DB password drift — verified migration 0028 syntactically against migration 0027 precedent and grep acceptance criteria; CI / fresh-dev path applies it.

## Commits

- `0d2528c` `feat(tenancy): add tenant suspend/resume aggregate methods and events`
- `ac2088f` `feat(events): add buildEnvelope helper reading correlationId from ALS`
- `2e223ce` `feat(tenancy): emit tenant_suspended/resumed event contracts through outbox`
- `289e9c3` `feat(tenancy): add suspend/resume internal HTTP routes`
- `6d1942a` `feat(catalog): block public menu routes when tenant is suspended`
- `9c1aea4` `feat(db): grant narrow DELETE on inbox_processed for retention sweep`
- `d1d5d33` `feat(api): add background jobs module with erasure + inbox-retention crons`
- `d2be885` `test(tenancy): e2e suspend/resume flow with audit roundtrip and 403 block`
- `1740331` `docs(api): regenerate openapi spec with suspend/resume endpoints`

## Deviations

8 deviations documented in `01-03-PLAN.md` `## Deviations` section. Highlights:

- Tasks 1+2+3 implemented together in working tree but committed in narrative order to keep pre-commit hook green at every step.
- Task 5 (RequireActiveTenant guard) does inline error mapping inside the guard since `ProblemDetailsFilter` does not call `mapDomainError` for guard-thrown errors. Missing-tenant ALS context fast-paths to `true` so 404-on-missing-tenant semantics in `requireTenantOr404()` still apply.
- Task 5 module wiring: `TENANT_REPOSITORY` is now exported by `TenancyModule`; `CatalogModule` imports `TenancyModule`.
- Task 6 migration 0028 syntax verified against 0027; not applied locally due to pg password drift.
- Task 9 `openapi:emit` script requires `.env` sourced before invocation (`NestFactory.create` exits silently on env validation failure).

## Downstream

Plan 01-04 builds on `buildEnvelope`, the migration-0028 GRANT (asserts it didn't leak), the 8-entry `WITHOUT_TENANT_ALLOWLIST`, the existing `BackgroundJobsModule` (no second `ScheduleModule.forRoot()`), and the `RequireActiveTenantGuard` registration in `CatalogModule`.
