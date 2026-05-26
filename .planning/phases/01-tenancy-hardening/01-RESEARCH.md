# Phase 1: Tenancy Hardening — Research

**Researched:** 2026-05-26
**Domain:** Multi-tenant platform hardening (NestJS modular monolith + Postgres RLS + NATS outbox)
**Confidence:** HIGH

## Summary

Phase 1 is brownfield platform hardening of an already-running NestJS / Drizzle / NATS stack. The single most consequential discovery from this research is that **persona reviews accurately mapped every TEN-xx requirement to its current code state** — there are very few mysteries left for the planner to discover. Of the 18 requirements: 4 are bug fixes in files that already exist (TEN-16/17 in `packages/events/`, TEN-09/14 across 8 named call-sites in `apps/api/src/contexts/identity/identity-core.module.ts` and `tenant-drizzle.repository.ts`); 4 are new infrastructure components that follow well-established patterns (TEN-05/06 erasure cron, TEN-13 inbox sweep, TEN-07/11 preflight assertions); 4 are new domain behavior (TEN-01..04 suspend/resume lifecycle); 2 are ESLint config additions (TEN-12/15); 1 is observability label work (TEN-10); 2 are quality nets (TEN-08 isolation tests, TEN-18 done already).

The `Tenant` aggregate already has `'suspended'` in its `TenantStatus` union but has **no `suspend()` / `resume()` method, no `TenantSuspended` / `TenantResumed` domain events, no `SuspendTenantService`, no `tenancy.tenant_suspended.v1` event contract, no internal HTTP route, and no `TenantSuspendedError` mapping**. Each of these missing artifacts has an exact analog already in the repo — the planner should clone the archive/offboard pattern verbatim. The `executeErasure` service body is also already correct; the cron wrapper (TEN-05/06) is the only new code.

**Primary recommendation:** Plan the 6-PR sequence locked in CONTEXT.md D-04 exactly as written. The dependency graph is real (TEN-16 unblocks TEN-08 teardown; TEN-14 unblocks TEN-09 migration; Docker stack in PR 2 unblocks PR 6 fixtures). The single highest-risk plan item is TEN-08 PR 6 — under-budgeting the 4 fixture categories will silently ship Phase 1 with the regression net half-built, which is the only place a future Phase 2..16 cross-tenant data leak could hide.

## User Constraints (from CONTEXT.md)

### Locked Decisions

| ID   | Decision                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | Phase 1 ships **monolithic** — all 18 TEN-\* requirements in one phase. Investor's 60/40 split rejected because the reqs are architecturally coupled.                                                                                                                                                                                                                                  |
| D-02 | Estimated **9–12 working days solo**. Under-sizing risks shipping TEN-08 at MVP-quality.                                                                                                                                                                                                                                                                                               |
| D-03 | TEN-18 (BA exact pin) already DONE in commit `19a9da2`. Plan does NOT include TEN-18 as a task; verify in DOR that the pin is on branch.                                                                                                                                                                                                                                               |
| D-04 | Phase ships in **6 PRs grouped by dependency**, executed sequentially: PR1 = TEN-16/17 bug fixes, PR2 = Docker test stack, PR3 = feature work (TEN-01..04, TEN-05/06/13 in one BackgroundJobsModule, TEN-14), PR4 = enforcement (TEN-07, TEN-11, TEN-12/15), PR5 = observability + audit gap close (TEN-09 + TEN-14 migration in same PR, TEN-10), PR6 = TEN-08 test net (PHASE GATE). |
| D-05 | TEN-10: **Emit `tenant_id` label NOW** on outbox lag, HTTP request rate, error rate. NO dashboards/alerts/cardinality work in Phase 1 — document ceiling as 50+ tenants.                                                                                                                                                                                                               |
| D-06 | TEN-08 uses **full Docker Compose stack** (Postgres 16 + NATS 2.10) in a new `docker-compose.test.yml`, modeled on existing `infra/docker/docker-compose.dev.yml`. No mocking of ALS / NATS.                                                                                                                                                                                           |
| D-07 | TEN-08 success criterion = **4 fixture categories** (all required, partial = not done): (1) ALS leak, (2) NATS subscriber tenant-context mix, (3) concurrent-write race, (4) cross-tenant read-leak with `WHERE tenant_id` omission.                                                                                                                                                   |
| D-08 | TEN-11: **Startup assertion** (not call-time throw) — `assertWithoutTenantCallsiteRegistered` joins the existing `assertNoRlsBypass` / `assertTenantLockInstalled` / `assertSetConfigRevoked` family in `packages/db/src/preflight.ts`. Boot fails fast on unregistered call site.                                                                                                     |
| D-09 | TEN-12 + TEN-15: **`no-restricted-syntax` overrides in `packages/config-eslint/`**, NOT a custom `eslint-plugin-resto`. Both rules are AST patterns. ~2 hours total vs 2 days for plugin.                                                                                                                                                                                              |
| D-10 | TEN-14 fallback when no active OTel span: **`randomUUID()` + WARN log** (Option B). Affected call sites: erasure scheduler, inbox sweep, any cron-emitted event. Explicit-correlationId threading (Option C) deferred.                                                                                                                                                                 |
| D-11 | TEN-05/06: **Continue-on-error per tenant**. One `@Cron('0 2 * * *')` daily at 02:00 iterates `listScheduledForErasure()`; each iteration in its own try/catch; failure → OTel error span + WARN log + continue. Aggregate "N of M succeeded, K failed" line at end.                                                                                                                   |
| D-12 | Single `BackgroundJobsModule` hosts BOTH TEN-13 inbox sweep AND TEN-05/06 erasure scheduler. One `ScheduleModule` setup, two `@Cron` services.                                                                                                                                                                                                                                         |
| D-13 | TEN-07: **12-check assertion** at boot using `has_table_privilege('resto_app', '<table>', '<priv>')` for {account, session, two_factor, verification} × {SELECT, INSERT, UPDATE}. Lives in `packages/db/src/preflight.ts` as `assertNoBaCredentialAccess`.                                                                                                                             |
| D-14 | TEN-09 scope = **`tenancy` + `identity` contexts ONLY**. 8 critical actions: provision, archive, offboard, suspend, erase, sign-in, sign-out, role-change. Gap analysis at `.planning/phases/01-tenancy-hardening/audit-gap.md`. `catalog` deferred to Phase 4; `ordering` to Phase 7.                                                                                                 |
| D-15 | TEN-09 and TEN-14 touch the SAME files in `identity-core.module.ts`. They MUST be in ONE PR (PR 5) to avoid mid-PR merge conflicts.                                                                                                                                                                                                                                                    |

### Claude's Discretion

- **Planner decides:** test runner library for Docker-backed integration tests (likely Vitest with custom `setupFiles` per `packages/db/test/integration/` conventions); CI job structure for Docker stack (one job vs matrix); exact OTel metric names / units for TEN-10 (follow existing Pino metric naming).
- **Researcher should investigate:** NestJS `@nestjs/schedule` `@Cron` timezone handling (UTC vs local-time semantics for "02:00 daily"); idempotency strategy if the cron fires twice during a deploy window (reuse advisory-lock pattern from outbox dispatcher).
- **Planner decides:** structure of `audit-gap.md` (markdown table vs checklist) — researcher suggests format below.

### Deferred Ideas (OUT OF SCOPE)

- `releaseOutboxClaim` claim-token race (`packages/events/src/outbox/repository.ts:110-128`) — Phase 7 ORD-11.
- `catalog` context audit gap analysis — Phase 4.
- `ordering` context audit + envelope migration — Phase 7.
- Per-email rate-limit migration to Redis — deferred to 2-replica horizontal scale event.
- Grafana dashboards / alert rules for per-tenant metrics — Phase 1.1 or 20+ tenants.
- `feature-flags` package scaffolding — deferred; Phase 16 ONB-05 uses env var instead.
- Custom `eslint-plugin-resto` — deferred; `no-restricted-syntax` suffices.
- Order-status guest emails — Phase 8 GNOTIF-01..04.

## Phase Requirements

| ID     | Description                                                                                             | Research Support                                                                                                                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TEN-01 | Operator can suspend a tenant (`active → suspended`)                                                    | Status enum already includes `'suspended'`; add aggregate method + service + DTO + internal HTTP route                                                                                                                                                                                                |
| TEN-02 | Suspended tenant returns 403/410 from customer endpoints                                                | `TenantContextMiddleware` is the integration point; throws `TenantSuspendedError` → 403 (or 410 if discussed below) via `error-mapping.ts`                                                                                                                                                            |
| TEN-03 | Operator can resume (`suspended → active`)                                                              | Mirror of TEN-01; same aggregate / service / route pattern                                                                                                                                                                                                                                            |
| TEN-04 | Suspend/resume emit `tenancy.tenant_suspended.v1` / `tenancy.tenant_resumed.v1` events with audit rows  | Add event contracts in `packages/events/src/contracts/tenancy.ts`; events flow to audit via existing `NatsAuditSubscriber`; extend `ACTION_TARGET_KIND` map in `record-audit.service.ts`                                                                                                              |
| TEN-05 | Daily scheduled job runs erasure                                                                        | New `BackgroundJobsModule` + `TenantErasureSchedulerService` with `@Cron('0 2 * * *')` calling existing `OffboardTenantService.listScheduled()` + `executeErasure()`                                                                                                                                  |
| TEN-06 | Erasure failures emit OTel error span + WARN log, no destructive retry                                  | Per-tenant try/catch in cron iteration body; OTel span via `trace.getActiveSpan().recordException(err)`; aggregate result log line                                                                                                                                                                    |
| TEN-07 | `resto_app` has zero privileges on BA credential tables; verified by SQL preflight at boot              | Migration 0027 already revokes; add `assertNoBaCredentialAccess` (12 `has_table_privilege` checks) to `packages/db/src/preflight.ts` and call from `apps/api/src/main.ts`                                                                                                                             |
| TEN-08 | Cross-tenant isolation test net — race, ALS leak, NATS mix, concurrent-write                            | New `docker-compose.test.yml`; 4 integration test files in `packages/db/test/integration/` (or `apps/api/test/e2e/` for HTTP-level scenarios); use existing `startPostgres()` + `with-real-stack.setup.ts` patterns                                                                                   |
| TEN-09 | Every critical action in tenancy + identity emits audit row; gap analysis written and closed            | Write `audit-gap.md`; close gaps by ensuring all 8 actions traverse outbox → NATS → `NatsAuditSubscriber`; extend `ACTION_TARGET_KIND` for new event types                                                                                                                                            |
| TEN-10 | Per-tenant OTel metrics (outbox lag, HTTP request rate, error rate) with `tenant_id` label              | Add `'tenant.id': envelope.tenantId ?? 'platform'` attribute to existing `deliveredCounter.add()`, `lagHistogram.record()`, and `claimFailuresCounter.add()` in `apps/api/src/infrastructure/outbox-dispatcher.service.ts`; instrument HTTP rate via interceptor reading `requireTenantContext()`     |
| TEN-11 | `withoutTenant` runtime allowlist; unregistered sites throw                                             | New `assertWithoutTenantCallsiteRegistered(allowlist)` boot assertion that compares allowlist constant against a runtime scan of import sites (or via stack-frame inspection at first call — see Risk 5 below)                                                                                        |
| TEN-12 | ESLint rule rejects `withoutTenant(` calls not in allowlist                                             | Existing rule in `apps/api/eslint.config.mjs:84-87` bans ALL `withoutTenant` calls and uses per-file override blocks for exemption (already-correct pattern). Extend to `packages/db/eslint.config.mjs` and `packages/events/eslint.config.mjs` for parity.                                           |
| TEN-13 | Daily scheduled job deletes `inbox_processed` rows older than 30 days                                   | Same `BackgroundJobsModule`; new `InboxRetentionService` with `@Cron('15 2 * * *')` (15 min offset from erasure cron) calling a delete in `withoutTenant` system context                                                                                                                              |
| TEN-14 | `buildEnvelope` helper reads `correlationId` from ALS; all `EventEnvelope` construction goes through it | New free function in `packages/events/src/envelope.ts` (alongside `defineEventContract`); calls `getCorrelationId()` from `correlation.ts`; fallback per D-10. Then migrate 8 named call-sites (3 in `identity-core.module.ts:110/127/151`, 5 in `tenant-drizzle.repository.ts:300/316/327/342/356`). |
| TEN-15 | ESLint rule rejects direct `correlationId: randomUUID()`                                                | New `no-restricted-syntax` selector matching `Property[key.name='correlationId'][value.callee.name='randomUUID']` and the `crypto.randomUUID()` MemberExpression variant. Add to `packages/config-eslint/base.mjs`.                                                                                   |
| TEN-16 | `OutboxDispatcher.stop()` is idempotent — concurrent callers receive cached stop-promise                | Cache `#stopPromise` on first `stop()` call; subsequent callers return the same promise (`packages/events/src/outbox/dispatcher.ts:118-124`)                                                                                                                                                          |
| TEN-17 | `appendToOutbox` validates envelope via `EventEnvelope.parse()` before insert                           | Add `EventEnvelope.parse(options.envelope)` at top of `appendToOutbox` (`packages/events/src/outbox/repository.ts:23`) — 1-line change                                                                                                                                                                |
| TEN-18 | Better Auth pinned to `=1.4.22` exact                                                                   | **DONE in commit `19a9da2`** — Phase 1 plan VERIFIES this in DOR; no implementation task                                                                                                                                                                                                              |

## Architectural Responsibility Map

| Capability                                    | Primary Tier                                                                                                                | Secondary Tier                                                                | Rationale                                                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Suspend / resume state transition (TEN-01/03) | Domain (aggregate)                                                                                                          | Application (service)                                                         | Pure state-machine invariant; no infra concerns. Mirrors existing `archive` / `scheduleOffboarding`.           |
| Suspended-tenant request blocking (TEN-02)    | Shared HTTP middleware (`TenantContextMiddleware`)                                                                          | Tenancy `error-mapping.ts`                                                    | The check sits at the request boundary where the tenant is already resolved; needs no per-controller wiring.   |
| Suspend/resume event emission (TEN-04)        | Infrastructure (`TenantDrizzleRepository.save`)                                                                             | Domain (event payload shape)                                                  | Existing pattern: `pullEvents()` drained in `save`, mapped to envelopes via `domainEventToEnvelope` switch.    |
| Erasure scheduler (TEN-05/06)                 | New infra `BackgroundJobsModule`                                                                                            | Application (`OffboardTenantService` — already exists)                        | `@Cron` is a delivery-layer concern; business logic stays in the already-correct application service.          |
| Inbox retention sweep (TEN-13)                | New infra `BackgroundJobsModule`                                                                                            | `packages/db` (raw delete on `inbox_processed` under `withoutTenant`)         | Platform-level data-minimization job; system-context only.                                                     |
| BA-creds boot assertion (TEN-07)              | `packages/db/src/preflight.ts`                                                                                              | `apps/api/src/main.ts` (preflight call)                                       | Joins the existing `assertNoRlsBypass` family — same shape, same call site.                                    |
| `withoutTenant` allowlist (TEN-11)            | `packages/db/src/preflight.ts`                                                                                              | `packages/db/src/withoutTenant.allowlist.ts` (already exists) + ESLint mirror | D-08: startup assertion is the canonical defense; ESLint is CI-side reinforcement.                             |
| `buildEnvelope` helper (TEN-14)               | `packages/events/src/envelope.ts`                                                                                           | `packages/events/src/correlation.ts` (ALS reader, already exists)             | Library-level helper consumed by every event-producing call site across `apps/api`. Free function, not a port. |
| Per-tenant OTel labels (TEN-10)               | `apps/api/src/infrastructure/outbox-dispatcher.service.ts` + HTTP interceptor                                               | OTel SDK                                                                      | Label emission is co-located with metric emission.                                                             |
| Audit gap analysis (TEN-09)                   | Documentation (`audit-gap.md`) + `apps/api/src/contexts/audit/application/record-audit.service.ts` `ACTION_TARGET_KIND` map | NATS subscriber pipeline (`NatsAuditSubscriber`)                              | The audit pipe exists; the work is enumerating gaps + extending the action→target-kind map.                    |
| Cross-tenant isolation tests (TEN-08)         | `packages/db/test/integration/` + `apps/api/test/e2e/`                                                                      | New `docker-compose.test.yml`                                                 | Existing test-container pattern is the template; new fixtures plug in.                                         |

## Standard Stack

### Core (already in tree — no additions for most TEN-xx)

| Library                      | Version    | Purpose                                                              | Why Standard                                                                       |
| ---------------------------- | ---------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `@nestjs/common`             | `^10.4.15` | DI container, decorators, lifecycle hooks                            | Existing platform — locked stack                                                   |
| `@nestjs/core`               | `^10.4.15` | NestJS runtime                                                       | Existing                                                                           |
| `@nestjs/platform-fastify`   | `^10.4.15` | HTTP transport                                                       | Existing                                                                           |
| `drizzle-orm`                | `^0.45.2`  | Postgres ORM                                                         | Existing — owned by `packages/db`                                                  |
| `postgres` (postgres.js)     | `^3.4.5`   | Low-level driver                                                     | Existing                                                                           |
| `nats` (JetStream)           | `^2.29.1`  | Event broker                                                         | Existing — owned by `packages/events`                                              |
| `zod`                        | `^3.24.1`  | Schema validation                                                    | Existing — used in `EventEnvelope` and `defineEventContract`                       |
| `@opentelemetry/api`         | `^1.9.0`   | Tracing + metrics API                                                | Existing — used in `OutboxDispatcherService`                                       |
| `vitest`                     | `^2.1.8`   | Test runner                                                          | Existing                                                                           |
| `@testcontainers/postgresql` | `^10.16.0` | Postgres test container                                              | Existing — already drives `packages/db/test/integration/` and `apps/api/test/e2e/` |
| `testcontainers`             | `^10.16.0` | Generic test container (used for NATS in `with-real-stack.setup.ts`) | Existing                                                                           |
| `better-auth`                | `=1.4.22`  | Auth                                                                 | Existing — exact pin landed in `19a9da2` (TEN-18 DONE)                             |

### New dependency (single addition for Phase 1)

| Library            | Version  | Purpose                                                                              | Why Standard                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | -------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nestjs/schedule` | `^4.1.2` | Declarative `@Cron`, `@Interval`, `@Timeout` decorators + `ScheduleModule.forRoot()` | Canonical NestJS cron package. Peer-deps `@nestjs/common: ^8 \|\| ^9 \|\| ^10` — compatible with the project's `@nestjs/common@10.4.15`. Version line `4.1.x` is the last NestJS-10-targeted train (v6.x targets NestJS 10/11). [VERIFIED: npm registry; description "Nest - @schedule"; repo `github.com/nestjs/schedule` — official NestJS package] |

**Verified version (2026-05-26):**

```bash
npm view @nestjs/schedule@4.1.2 version peerDependencies
# version = '4.1.2'
# peerDependencies = { '@nestjs/core': '^8.0.0 || ^9.0.0 || ^10.0.0',
#                      '@nestjs/common': '^8.0.0 || ^9.0.0 || ^10.0.0' }
```

**Installation:**

```bash
pnpm add --filter @resto/api @nestjs/schedule@^4.1.2
```

**Pin policy reminder:** TEN-18 set a precedent of `=1.4.22` for Better Auth. `@nestjs/schedule` is much lower-risk surface area (no breaking auth contracts), so caret-pinning at `^4.1.2` is acceptable — but the planner may choose to follow the TEN-18 pattern and pin exact (`=4.1.2`) for consistency. Recommend exact pin to keep "deliberate upgrades become phase deliverables" rule uniform.

### Alternatives Considered

| Instead of                           | Could Use                                                                         | Tradeoff                                                                                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nestjs/schedule` + `@Cron`         | Bare `node:timers/promises` `setInterval` loop wrapped in a NestJS lifecycle hook | Drops a dependency, but loses cron-expression syntax, declarative discovery, and the `SchedulerRegistry` API for testing. Net negative for solo dev. |
| One `BackgroundJobsModule` per D-12  | Two separate modules (`TenancyJobsModule`, `RetentionJobsModule`)                 | D-12 explicitly chose one module — `ScheduleModule.forRoot()` is global anyway, so two modules buys nothing.                                         |
| `no-restricted-syntax` for TEN-12/15 | Custom `eslint-plugin-resto` package                                              | D-09 locked: built-in rule = 2 hours, custom plugin = 2 days. Match team scale.                                                                      |
| Full Docker stack (D-06)             | Mocked ALS / mocked NATS                                                          | D-06 locked: persona-cto explicit that mocked tests prove nothing about ALS leaks.                                                                   |

## Package Legitimacy Audit

| Package                  | Registry | Age              | Downloads | Source Repo                | slopcheck   | Disposition                                                                                                                                             |
| ------------------------ | -------- | ---------------- | --------- | -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nestjs/schedule@4.1.2` | npm      | 6+ yrs (v4 line) | 1M+/wk    | github.com/nestjs/schedule | unavailable | Approved (verified via `npm view`: description = "Nest - … @schedule", repo URL is the canonical NestJS org repo, peer-deps match project NestJS major) |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

_slopcheck was unavailable at research time, but `@nestjs/schedule` is the canonical, widely-used official NestJS package and is referenced in NestJS official docs. The planner does NOT need to add a `checkpoint:human-verify` task for this install — registry verification (`npm view` confirms `github.com/nestjs/schedule` and the `@nestjs` org) is sufficient._

## Project Constraints (from CLAUDE.md)

These directives have the same authority as locked decisions. Plans must conform.

- **RLS double-enforcement (root CLAUDE.md, ADR-0020 I-1):** Every tenant-scoped query goes through `ScopedTx` AND Postgres RLS. RLS alone is not sufficient.
- **`runInTenantContext` is HTTP-middleware-only (ADR-0020 I-6):** New cron jobs (TEN-05/06, TEN-13) MUST use `db.withTenantId(tenantId, ...)` or `db.withoutTenant(reason, ...)`. The ESLint rule in `packages/config-eslint/base.mjs` already enforces this via `no-restricted-imports`.
- **Composite FK on every tenant-scoped child table (ADR-0020 I-2):** No new child tables in Phase 1, so this is a non-issue here.
- **`correlationId` derives from OTel span (ADR-0020 I-4):** TEN-14 implements the canonical helper.
- **Hard deletes forbidden:** `resto_app` has no DELETE privilege. The inbox retention sweep (TEN-13) is the ONE exception — it explicitly needs DELETE on `inbox_processed`. Plan: either run the sweep under `resto_admin` (preferred), or grant `resto_app` DELETE on `inbox_processed` specifically with a guarded migration. **Decision needed; see Open Questions.**
- **`INTERNAL_API_TOKEN` is server-only.** Suspend/resume internal routes (TEN-01/03) sit on `/internal/v1/tenants/:id/suspend` behind `InternalTokenGuard` — matches existing offboard route.
- **`withoutTenant` requires non-empty reason string.** TEN-11 elevates the existing allowlist parity test to a runtime assertion.
- **No raw SQL outside `packages/db`:** TEN-13 inbox sweep DELETE must live in `packages/db` (e.g., a new `inbox-retention.ts` helper), not in `apps/api`.
- **Commit conventions (~/.claude/CLAUDE.md):** No Claude attribution in commit messages. Conventional Commits prefix. Single-line subject. New branch per phase by default (`gsd/phase-01-tenancy-hardening` per `.planning/config.json` `phase_branch_template`).
- **shadcn UI rule isn't relevant to Phase 1** (pure platform; no UI surface).

## Architecture Patterns

### System Architecture Diagram

```text
                                    ┌─────────────────────────────┐
   Operator (admin app)             │ apps/api (NestJS monolith)  │
   POST /internal/v1/tenants/:id/   │                             │
     suspend  ─────────────────────▶│ InternalTenantsController   │
                                    │  └─▶ SuspendTenantService   │
                                    │      └─▶ TenantRepo.save()  │
                                    │           └─▶ Drizzle tx    │
                                    │                ├─▶ tenants  │
                                    │                ├─▶ outbox   │
                                    │                │   (TEN-04  │
                                    │                │    event)  │
                                    │                │            │
   Guest (qr-menu, site)            │                │            │
   GET /v1/menu  ───┐                │                │            │
                    │                │                │            │
                    ▼                │                │            │
              TenantContextMiddleware│                │            │
              resolves tenant → ALS  │                │            │
              ┌─ TEN-02 check ──┐    │                │            │
              │ if tenant.status│    │                │            │
              │ === 'suspended':│    │                │            │
              │ throw → 403     │    │                │            │
              └─────────────────┘    │                │            │
                    │                │                │            │
                    ▼                │                │            │
              PublicMenuController   │                │            │
                                    └────────────────┼────────────┘
                                                     │
                                  OutboxDispatcher   │
                                   (leader-locked)   │
                                                     ▼
                                              NATS JetStream
                                              (tenancy.>, identity.>)
                                                     │
                                                     ▼
                                            NatsAuditSubscriber
                                              └─▶ runDeduped()
                                                   └─▶ audit_log row
                                                      (TEN-09)

                                    ┌─────────────────────────────┐
   @Cron('0 2 * * *')               │ BackgroundJobsModule         │
   (D-11, D-12)                     │                              │
                                    │ TenantErasureSchedulerService│
                                    │  └─ listScheduled()          │
                                    │     for each tenant:         │
                                    │       try executeErasure()   │
                                    │       catch → OTel error span│
                                    │                + WARN log    │
                                    │                + continue    │
                                    │                              │
                                    │ InboxRetentionService        │
                                    │  └─ DELETE FROM inbox_       │
                                    │     processed WHERE          │
                                    │     processed_at < now()-30d │
                                    └─────────────────────────────┘

                                    ┌─────────────────────────────┐
   Boot                             │ apps/api/src/main.ts         │
                                    │  ├─ assertNoRlsBypass        │
                                    │  ├─ assertTenantLockInstalled│
                                    │  ├─ assertSetConfigRevoked   │
                                    │  ├─ assertNoBaCredAccess ◀── │ TEN-07 (new)
                                    │  └─ assertWithoutTenant      │
                                    │       CallsiteRegistered ◀── │ TEN-11 (new)
                                    └─────────────────────────────┘
```

### Recommended Project Structure

```
apps/api/src/
├── contexts/
│   └── tenancy/
│       ├── domain/
│       │   ├── tenant.aggregate.ts          # add Tenant.suspend()/resume() + events
│       │   ├── events.ts                    # add TenantSuspendedDomainEvent / TenantResumedDomainEvent
│       │   ├── errors.ts                    # add TenantSuspendedError, TenantNotSuspendedError
│       │   └── ports.ts                     # (no change)
│       ├── application/
│       │   └── suspend-tenant.service.ts    # NEW — mirrors archive-tenant.service.ts
│       ├── infrastructure/
│       │   └── tenant-drizzle.repository.ts # update domainEventToEnvelope switch + migrate to buildEnvelope (TEN-14)
│       └── interfaces/http/
│           ├── internal-tenants.controller.ts  # add POST :id/suspend, POST :id/resume
│           └── error-mapping.ts                # map TenantSuspendedError → 403 (or 410)
├── shared/
│   └── tenant-context.middleware.ts          # TEN-02: post-resolution suspend check
├── infrastructure/
│   ├── background-jobs.module.ts             # NEW — D-12
│   ├── tenant-erasure-scheduler.service.ts   # NEW — TEN-05/06
│   └── inbox-retention.service.ts            # NEW — TEN-13
└── main.ts                                    # add assertNoBaCredAccess + assertWithoutTenantAllowlist calls

packages/db/src/
├── preflight.ts                               # add assertNoBaCredentialAccess + assertWithoutTenantCallsiteRegistered
├── inbox-retention.ts                         # NEW — DELETE helper for TEN-13 (kept inside packages/db per "no raw SQL outside db" rule)
└── withoutTenant.allowlist.ts                 # extend if any new system-context callsite added (likely zero)

packages/events/src/
├── envelope.ts                                # NEW: export buildEnvelope() (TEN-14)
├── contracts/tenancy.ts                       # add TenantSuspendedV1, TenantResumedV1
├── outbox/dispatcher.ts                       # TEN-16: cache stop-promise
└── outbox/repository.ts                       # TEN-17: EventEnvelope.parse() at top of appendToOutbox

packages/config-eslint/
└── base.mjs                                   # TEN-15: no-restricted-syntax for correlationId: randomUUID()

infra/docker/
├── docker-compose.dev.yml                     # (existing — template)
└── docker-compose.test.yml                    # NEW — Postgres 16 + NATS 2.10, ephemeral, smaller resource profile

.planning/phases/01-tenancy-hardening/
├── 01-CONTEXT.md  (existing)
├── 01-PERSONA-REVIEWS.md  (existing)
├── 01-RESEARCH.md (this file)
└── audit-gap.md                               # NEW — created during planning (TEN-09)
```

### Pattern 1: Adding a domain event to the Tenant aggregate

**What:** TEN-04 needs `tenancy.tenant_suspended.v1` and `tenancy.tenant_resumed.v1` events. The existing tenant lifecycle events (Provisioned/Archived/OffboardingScheduled/OffboardingCancelled/ErasureCompleted) are the exact template.

**When to use:** Every TEN-04 task (event contract + domain event + repo envelope mapper).

**Example:**

```typescript
// packages/events/src/contracts/tenancy.ts — add at end of file
export const TenantSuspendedV1Payload = z.object({
  tenantId: TenantId,
  requestedBy: z.string().min(1),
  suspendedAt: z.coerce.date(),
});
export type TenantSuspendedV1Payload = z.infer<typeof TenantSuspendedV1Payload>;
export const TenantSuspendedV1 = defineEventContract({
  type: 'tenancy.tenant_suspended.v1',
  payload: TenantSuspendedV1Payload,
});

export const TenantResumedV1Payload = z.object({
  tenantId: TenantId,
  resumedAt: z.coerce.date(),
});
export type TenantResumedV1Payload = z.infer<typeof TenantResumedV1Payload>;
export const TenantResumedV1 = defineEventContract({
  type: 'tenancy.tenant_resumed.v1',
  payload: TenantResumedV1Payload,
});

// apps/api/src/contexts/tenancy/domain/events.ts — extend the union
export interface TenantSuspendedDomainEvent {
  readonly kind: 'TenantSuspended';
  readonly tenantId: TenantId;
  readonly requestedBy: string;
  readonly suspendedAt: Date;
  readonly occurredAt: Date;
}
// (and TenantResumedDomainEvent the same way)
// then extend `type TenantDomainEvent = ... | TenantSuspendedDomainEvent | TenantResumedDomainEvent`

// apps/api/src/contexts/tenancy/domain/tenant.aggregate.ts — add methods
suspend(requestedBy: string, now: Date = new Date()): void {
  if (this.snapshot.status === 'suspended') {
    throw new TenantAlreadySuspendedError(this.snapshot.id);
  }
  if (this.snapshot.status !== 'active') {
    throw new TenantSuspensionNotAllowedError(this.snapshot.id, this.snapshot.status);
  }
  this.snapshot = { ...this.snapshot, status: 'suspended', updatedAt: now };
  this.#events.push({ kind: 'TenantSuspended', tenantId: this.snapshot.id,
    requestedBy, suspendedAt: now, occurredAt: now });
}
resume(now: Date = new Date()): void {
  if (this.snapshot.status !== 'suspended') {
    throw new TenantNotSuspendedError(this.snapshot.id, this.snapshot.status);
  }
  this.snapshot = { ...this.snapshot, status: 'active', updatedAt: now };
  this.#events.push({ kind: 'TenantResumed', tenantId: this.snapshot.id,
    resumedAt: now, occurredAt: now });
}

// apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts:292
// extend domainEventToEnvelope switch — after migrating to buildEnvelope (TEN-14),
// the new entries should NOT use randomUUID() for correlationId.
case 'TenantSuspended':
  return buildEnvelope(TenantSuspendedV1, {
    tenantId: event.tenantId,
    requestedBy: event.requestedBy,
    suspendedAt: event.suspendedAt,
  }, { tenantId: event.tenantId, occurredAt: event.occurredAt });
```

Source: existing `apps/api/src/contexts/tenancy/domain/{tenant.aggregate,events,errors}.ts` patterns; `packages/events/src/contracts/tenancy.ts`.

### Pattern 2: `buildEnvelope` API shape (TEN-14)

**What:** A free helper that wraps `defineEventContract`'s output into a complete `EventEnvelope` by reading `correlationId` from ALS and falling back per D-10.

**Example:**

```typescript
// packages/events/src/envelope.ts — append (or new file build-envelope.ts)
import { randomUUID } from 'node:crypto';
import { getTenantContext } from '@resto/db';
import { getCorrelationId } from './correlation';

const logger = /* pino logger from packages/db/src/logger.ts or a local one */;

export interface BuildEnvelopeOptions {
  /** Override tenantId — required for background jobs that lack ALS. */
  readonly tenantId?: string | null;
  /** Override occurredAt — defaults to `new Date()`. */
  readonly occurredAt?: Date;
  /** Override correlationId — explicit threading for background jobs. */
  readonly correlationId?: string;
  /** Causation id from another event, if this one was triggered by it. */
  readonly causationId?: string | null;
}

export const buildEnvelope = <TPayload>(
  contract: EventContract<TPayload>,
  payload: TPayload,
  options: BuildEnvelopeOptions = {},
): EventEnvelope => {
  let correlationId = options.correlationId ?? getCorrelationId();
  if (!correlationId) {
    correlationId = randomUUID();
    logger.warn(
      { eventType: contract.type, fallbackCorrelationId: correlationId },
      'buildEnvelope: no active OTel span / ALS correlationId — falling back to randomUUID (D-10)',
    );
  }
  const tenantId =
    options.tenantId !== undefined ? options.tenantId : (getTenantContext()?.tenantId ?? null);

  return {
    id: randomUUID(),
    type: contract.type,
    version: contract.version,
    tenantId,
    correlationId,
    causationId: options.causationId ?? null,
    occurredAt: options.occurredAt ?? new Date(),
    payload,
  } satisfies EventEnvelope;
};
```

**Migration target list** (TEN-09 + TEN-14 in PR 5):

- `apps/api/src/contexts/identity/identity-core.module.ts:106` (`onSignedOut`)
- `apps/api/src/contexts/identity/identity-core.module.ts:122` (`onPasswordResetCompleted`)
- `apps/api/src/contexts/identity/identity-core.module.ts:147` (`onActiveOrganizationSet`)
- `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts:296` (`TenantProvisioned`)
- `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts:312` (`TenantArchived`)
- `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts:323` (`TenantOffboardingScheduled`)
- `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts:338` (`TenantOffboardingCancelled`)
- `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts:352` (`TenantErasureCompleted`)

### Pattern 3: Boot preflight assertion (TEN-07, TEN-11)

**What:** Follow the existing `assertNoRlsBypass` / `assertTenantLockInstalled` / `assertSetConfigRevoked` shape — one named error class, one async function that opens a short-lived connection, runs the check, closes.

**Example for TEN-07:**

```typescript
// packages/db/src/preflight.ts — append
export class BaCredentialAccessNotRevokedError extends Error {
  constructor(public readonly grants: { table: string; priv: string }[]) {
    super(
      `TEN-07: resto_app retains the following privileges on BA credential tables: ` +
        grants.map((g) => `${g.priv} ${g.table}`).join(', ') +
        `. Re-run pnpm db:migrate (migration 0027).`,
    );
    this.name = 'BaCredentialAccessNotRevokedError';
  }
}

const BA_TABLES = ['account', 'session', 'two_factor', 'verification'] as const;
const BA_PRIVS = ['SELECT', 'INSERT', 'UPDATE'] as const;

export const assertNoBaCredentialAccess = async (
  url: string,
): Promise<void> => {
  const client = postgres(url, {
    max: 1,
    prepare: false,
    onnotice: () => undefined,
  });
  try {
    const rows = await Promise.all(
      BA_TABLES.flatMap((table) =>
        BA_PRIVS.map(async (priv) => {
          const r = await client<{ has: boolean }[]>`
            SELECT has_table_privilege(current_user, ${table}, ${priv}) AS has
          `;
          return { table, priv, has: r[0]?.has ?? false };
        }),
      ),
    );
    const offending = rows.filter((r) => r.has);
    if (offending.length > 0) {
      throw new BaCredentialAccessNotRevokedError(
        offending.map((r) => ({ table: r.table, priv: r.priv })),
      );
    }
    logger.info(
      { checks: BA_TABLES.length * BA_PRIVS.length },
      'Database preflight passed: resto_app has zero privileges on BA credential tables.',
    );
  } finally {
    await client.end({ timeout: 5 });
  }
};
```

Then in `apps/api/src/main.ts:48`:

```typescript
await assertSetConfigRevoked(env.DATABASE_URL);
await assertNoBaCredentialAccess(env.DATABASE_URL); // TEN-07
await assertWithoutTenantCallsiteRegistered(); // TEN-11
```

### Pattern 4: `@Cron` service in `BackgroundJobsModule` (TEN-05/06, TEN-13)

```typescript
// apps/api/src/infrastructure/background-jobs.module.ts — NEW
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TenantErasureSchedulerService } from './tenant-erasure-scheduler.service';
import { InboxRetentionService } from './inbox-retention.service';
import { TenancyModule } from '../contexts/tenancy/tenancy.module'; // for OffboardTenantService
import { DatabaseModule } from './database.module';

@Module({
  imports: [ScheduleModule.forRoot(), TenancyModule, DatabaseModule],
  providers: [TenantErasureSchedulerService, InboxRetentionService],
})
export class BackgroundJobsModule {}
```

```typescript
// apps/api/src/infrastructure/tenant-erasure-scheduler.service.ts — NEW
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { OffboardTenantService } from '../contexts/tenancy/application/offboard-tenant.service';

@Injectable()
export class TenantErasureSchedulerService {
  private readonly logger = new Logger(TenantErasureSchedulerService.name);
  private readonly tracer = trace.getTracer('resto.api.erasure-scheduler');

  constructor(
    @Inject(OffboardTenantService)
    private readonly offboard: OffboardTenantService,
  ) {}

  @Cron('0 2 * * *', { name: 'tenant-erasure', timeZone: 'UTC' }) // D-11
  async run(): Promise<void> {
    const scheduled = await this.offboard.listScheduled();
    let ok = 0;
    let failed = 0;
    for (const t of scheduled) {
      try {
        await this.offboard.executeErasure({ tenantId: t.id });
        ok += 1;
      } catch (err) {
        failed += 1;
        const span = this.tracer.startSpan('erasure.tenant', {
          attributes: { 'tenant.id': t.id },
        });
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.end();
        this.logger.warn(
          { tenantId: t.id, err },
          'Erasure failed; will retry next run',
        );
      }
    }
    this.logger.log(
      { ok, failed, total: scheduled.length },
      'Erasure cron complete',
    );
  }
}
```

### Anti-Patterns to Avoid

- **Using `runInTenantContext` inside the cron handler.** ESLint already blocks this. Use `db.withTenantId(tenantId, ...)` — `executeErasure` already calls `withoutTenant` internally so the cron itself doesn't even need to bind.
- **Looping `Promise.all(scheduled.map(executeErasure))`.** Per-tenant try/catch must run sequentially (or with bounded concurrency) so one failure doesn't unhandled-reject the whole run. Per D-11 the policy is sequential with continue-on-error.
- **Skipping `EventEnvelope.parse()` in `buildEnvelope`.** Since TEN-17 adds `.parse()` to `appendToOutbox`, every envelope built via `buildEnvelope` already gets validated downstream. But TEN-15's lint rule won't catch a future caller that constructs an envelope literal and `await tx.insert(outboxEvents)` directly. Plan documents this as a separate vector.
- **Adding a new TenantStatus value without updating `ALLOWED_STATUSES` in `tenant-drizzle.repository.ts:21-27`.** The status enum is duplicated in the repo (string-set guard). The current set already includes `'suspended'`, so this is OK for Phase 1 but worth flagging for any future status change.
- **Returning HTTP 410 for suspended tenants.** ROADMAP says "403/410." Persona reviews didn't specify which. Recommend **403 Forbidden** for active suspensions (the tenant could be reactivated) and reserve **410 Gone** for fully erased tenants (already irrecoverable). See Open Questions.

## Don't Hand-Roll

| Problem                                                   | Don't Build                                  | Use Instead                                                                                                                                                                                                                       | Why                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cron scheduling                                           | `setInterval` + custom drift compensation    | `@nestjs/schedule` `@Cron` decorator                                                                                                                                                                                              | Already a NestJS-native dep tree; gets `SchedulerRegistry` for test substitution + `CronExpression` constants for free                                                                                                                                                                                                                               |
| Stop-promise caching for `OutboxDispatcher.stop()`        | Custom `Promise.race` with timeout           | The standard "memoize the first stop call" pattern: `this.#stopPromise ??= new Promise(...)`                                                                                                                                      | Canonical idempotency idiom; ~5 LoC; documented in `packages/events/CLAUDE.md`                                                                                                                                                                                                                                                                       |
| Stack-frame inspection for TEN-11 allowlist runtime check | `Error.captureStackTrace` + V8 frame parsing | Static module-level allowlist + `assertWithoutTenantCallsiteRegistered` boot-time check that every entry in `WITHOUT_TENANT_ALLOWLIST` corresponds to a real file (and optionally that no NEW file references `db.withoutTenant`) | Stack-frame parsing is fragile across runtimes; the static check + ESLint per-file override is the same pattern the team uses for module-boundary enforcement. **See Risk 5 below for an alternative: static-analysis at boot via `tsc` AST scan, but that's heavier; recommend "trust the allowlist parity test + ESLint" as the runtime defense.** |
| Custom ESLint rule plugin for TEN-12/15                   | `eslint-plugin-resto` package                | `no-restricted-syntax` in `packages/config-eslint/base.mjs` per D-09                                                                                                                                                              | 2 hours vs 2 days; team-scale lints aren't justified yet                                                                                                                                                                                                                                                                                             |
| Cross-tenant test harness for TEN-08                      | Hand-rolled async setup                      | `apps/api/test/e2e/with-real-stack.setup.ts` (already starts Postgres + NATS testcontainers + full NestJS app)                                                                                                                    | This file is the canonical pattern — used by 12 existing e2e spec files                                                                                                                                                                                                                                                                              |
| OTel error span recording for TEN-06                      | Custom error-event emission                  | `trace.getTracer(...).startSpan(...).recordException(err); span.setStatus({ code: SpanStatusCode.ERROR }); span.end()`                                                                                                            | Stock OTel SDK API; integrates with the auto-instrumented exporter already wired in `apps/api/src/bootstrap-telemetry.ts`                                                                                                                                                                                                                            |
| BA-credentials privilege check                            | Reading `pg_class` ACL bitfields             | `has_table_privilege('resto_app', '<table>', '<priv>')` (D-13)                                                                                                                                                                    | Standard Postgres function; handles role-inheritance chains transparently                                                                                                                                                                                                                                                                            |

**Key insight:** Phase 1 is hardening, not greenfield. Every requirement either reuses an existing pattern or adds a single boot assertion. The temptation to "improve" patterns (custom plugin, custom stack-walker, custom span emitter) is the main scope-creep risk — defer all such improvements to follow-on phases.

## Runtime State Inventory

This phase has limited rename/migration surface — most work is additive. The relevant runtime state:

| Category            | Items Found                                                                                                                                                                                                                                                                                               | Action Required                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Stored data         | `tenants.status` column already accepts `'suspended'` (no migration); existing erased-tenant `slug = 'erased-<id>-<ts>'` collision-safe pattern. `inbox_processed` has tenant_id + processed_at; retention sweep operates here.                                                                           | None for status; TEN-13 retention will mass-delete from `inbox_processed`.  |
| Live service config | `OutboxDispatcher` runs in process; `NatsAuditSubscriber` subscribes to `tenancy.>` and `identity.>`. New event types (`tenancy.tenant_suspended.v1`, `tenancy.tenant_resumed.v1`) are matched by the wildcard — no NATS stream config change required, but TENANCY_SUBJECT subscriber will receive them. | Verify `STREAM_SUBJECTS` already covers `tenancy.>` (per `nats.module.ts`). |
| OS-registered state | None — no Task Scheduler / launchd integration. The `@Cron` jobs run in-process.                                                                                                                                                                                                                          | None.                                                                       |
| Secrets/env vars    | `AUDIT_ERASURE_SALT` already required for erasure. No new secrets in Phase 1. `INTERNAL_API_TOKEN` reused for suspend/resume routes.                                                                                                                                                                      | None.                                                                       |
| Build artifacts     | The OpenAPI artifact at `docs/api/openapi.yaml` (committed) will pick up new suspend/resume routes. Plan must include a step "regenerate OpenAPI" (`pnpm openapi:emit` per `apps/api/package.json`).                                                                                                      | Regenerate OpenAPI + commit.                                                |

**Nothing in OS-registered state, no secret renames, no stale package installs** — confirmed by inspection of `apps/api/package.json`, `apps/api/src/bootstrap-telemetry.ts`, and the project root.

## Common Pitfalls

### Pitfall 1: `OutboxDispatcher.stop()` idempotency fix breaks the `#runLoop` shutdown sequence

**What goes wrong:** A naive fix that simply caches `#stopPromise` may leave `#stopResolver` unset if the first caller's promise was already resolved before the second caller `await`'d it. The current `#runLoop` (lines 126-141) calls `this.#stopResolver?.()` then sets it to `null` — concurrent stops can race on this nullification.

**Why it happens:** The contract today is "one stop call only." TEN-16 changes it to "any number of stop calls converge." The implementation must (a) cache the promise on first call, (b) ensure the resolver is captured into a local variable inside the promise executor before being attached to `this`, and (c) only invoke the resolver from the loop once.

**How to avoid:**

```typescript
async stop(): Promise<void> {
  if (!this.#running) return;
  this.#stopped = true;
  this.#stopPromise ??= new Promise<void>((resolve) => {
    this.#stopResolver = resolve;
  });
  return this.#stopPromise;
}
// in #runLoop after the while exits:
this.#running = false;
const resolver = this.#stopResolver;
this.#stopResolver = null;
resolver?.();
```

**Warning signs:** test for "two parallel `stop()` calls both await and both return" — if the second never resolves, the cache is broken.

### Pitfall 2: `appendToOutbox` envelope validation throws inside a transaction

**What goes wrong:** Adding `EventEnvelope.parse(options.envelope)` at the top of `appendToOutbox` means a malformed envelope now throws BEFORE the INSERT. Callers wrap this in `tx.execute(...)` chains; the throw propagates up through `withTenant`/`withoutTenant` and the transaction rolls back.

**Why it happens:** Today, a malformed envelope reaches the broker and fails consumer-side (or fails the DB CHECK constraint partially). Post-TEN-17, the same envelope fails at the application layer with a Zod error.

**How to avoid:**

- TEN-17 is the desired behavior — fail fast.
- BUT the integration test for TEN-17 must demonstrate that the throw arrives BEFORE the outbox row is inserted (assert `outbox_events` count unchanged after malformed insert attempt).
- The error type should be plain `ZodError`; do NOT wrap in a domain error.

**Warning signs:** if any existing producer relied on Zod's lenient `.coerce.date()` to accept ISO strings, TEN-17 may surface latent contract drift — run the full suite after.

### Pitfall 3: TEN-02 suspension check in `TenantContextMiddleware` triggers on internal admin routes too

**What goes wrong:** If `TenantContextMiddleware` rejects suspended tenants unconditionally, operators cannot call `/internal/v1/tenants/:id/resume` because the request itself is blocked.

**Why it happens:** The middleware resolves the tenant before any controller-level guard runs. A naive "if suspended, throw 403" is too aggressive.

**How to avoid:** Scope the check to **customer-facing** routes only:

```typescript
// In TenantContextMiddleware.use after resolveContext:
if (
  context?.tenantStatus === 'suspended' &&
  this.isCustomerFacingRoute(req.url)
) {
  throw new TenantSuspendedError(context.tenantId);
}
```

where `isCustomerFacingRoute` allowlists `/v1/menu`, `/v1/menu/items/*`, and (eventually) the site/qr-menu paths but excludes `/internal/v1/*` and the operator-facing `/v1/tenants/me` paths. **The simpler alternative is to push the check into `PublicMenuController` (and future `@Public` controllers) via a new `RequireActiveTenant()` decorator**, keeping the middleware purely informational. Persona reviews are silent; **planner decides**. Recommend the decorator approach — it's less spooky-action-at-a-distance.

**Warning signs:** operator e2e tests fail with "tenant suspended" after suspending a test tenant.

### Pitfall 4: TEN-08 ALS leak fixture passes because the test is sequential

**What goes wrong:** Writing the ALS leak test as `await runInTenantContext(A, ...); await runInTenantContext(B, ...);` proves nothing — ALS is correct by construction for sequential calls. The bug class TEN-08 is meant to catch is a context leaking between two **concurrent** request paths.

**Why it happens:** Pressure to ship the test net leads to the easiest possible assertion. Persona-skeptic flagged this specifically.

**How to avoid:** Use `Promise.all([runInTenantContext(A, longOp), runInTenantContext(B, longOp)])` where `longOp` interleaves Postgres queries and `setTimeout`s; assert that EACH op's query reads only its own tenant_id. Run this 100× in a tight loop in CI to surface low-probability interleavings. See Pitfall 5 for the concurrent-write companion fixture.

**Warning signs:** TEN-08 PR ships with a single `it('isolates tenants')` that takes <100ms. Hard reject in code review.

### Pitfall 5: Concurrent-write race fixture requires `RC SERIALIZABLE` or a forced contention

**What goes wrong:** Two parallel inserts to the same tenant-scoped table from different tenants will both succeed without contention — composite FK + RLS already prevent the wrong-tenant insert from succeeding. The race the test is supposed to surface is "tenant A inserts, GUC drift puts tenant B's `app.current_tenant` into A's transaction." That requires a specific failure mode (e.g., ALS leak combined with `app_bind_tenant` re-entry).

**How to avoid:**

- Test 1: two `withTenant(A)` and `withTenant(B)` callbacks run with `Promise.all`. Each inserts a tenant-scoped row. Assert: each row's `tenant_id` matches the calling context's tenant_id.
- Test 2: use `pg_sleep(0.5)` inside one callback's transaction to widen the window where ALS context could leak. Repeat under heavy load.

**Warning signs:** the test "passes" but inspecting the rows shows tenant_id always matches — that's a positive result IF the test design actually creates the interleaving. Verify by deliberately introducing a leak (e.g., temporarily delete the `#assertGucUnchanged` call in `client.ts`) and confirming the test fails.

### Pitfall 6: `assertWithoutTenantCallsiteRegistered` runs at boot but the allowlist is a TypeScript constant

**What goes wrong:** The allowlist in `packages/db/src/withoutTenant.allowlist.ts` is a TypeScript array of relative paths. At runtime (post-build), `__filename` resolution returns absolute paths inside `node_modules` or `dist`. The naïve assertion `WITHOUT_TENANT_ALLOWLIST.includes(__filename)` always fails in production builds.

**How to avoid:**

- Decision A: scope TEN-11 to **boot-time presence assertion** only ("each path in the allowlist exists as a real file"), NOT call-site enforcement. The ESLint rule remains the call-site fence. Per D-08, this is the locked decision — startup catches misconfiguration before requests are served, but the "unregistered call site" detection is structurally an ESLint job.
- Decision B (stronger): the assertion can also scan the post-build dist for source-map paths via `import.meta.url` round-tripping. Heavier. Defer.

**Recommend: Decision A.** D-08 already specifies startup assertion semantics. The planner should clarify in the PLAN.md task description that "runtime assertion" = "boot-time allowlist sanity check," not "per-call stack-walk."

**Warning signs:** TEN-11 task description in PLAN.md says "stack-trace inspection" — flag as scope creep.

### Pitfall 7: `@Cron` timezone handling differs between local dev and prod UTC

**What goes wrong:** `@Cron('0 2 * * *')` without a `timeZone` option uses the host's TZ. Dev machines (CET, EST) run the job at 02:00 local; prod EKS pods run UTC, 02:00 UTC = 03:00 in CET. Operators expecting "EU local 02:00" don't get it.

**Why it happens:** Default `@nestjs/schedule` behavior. Persona CTO's discussion item flagged this.

**How to avoid:** Always set `{ timeZone: 'UTC' }` explicitly:

```typescript
@Cron('0 2 * * *', { name: 'tenant-erasure', timeZone: 'UTC' })
```

Document the choice in `BackgroundJobsModule` JSDoc: "Cron runs in UTC; if EU-local-time semantics matter later, switch to `process.env.SCHEDULER_TZ ?? 'UTC'`." For Phase 1, UTC is correct (and standard for GDPR's "within 30 days" semantics — Postgres timestamps are UTC).

### Pitfall 8: TEN-13 inbox retention DELETE blocked by `resto_app` having no DELETE privilege

**What goes wrong:** `inbox_processed` is in the `public` schema and tenant-aware DB connections run as `resto_app` (NOBYPASSRLS, no DELETE). The retention sweep fails.

**How to avoid:**

- Option A (recommended): Run the sweep under the migration-time admin role via a new migration-time stored procedure (`sweep_old_inbox_processed(days INT)`), called via `tx.execute(sql\`SELECT sweep_old_inbox_processed(30)\`)`from inside`withoutTenant`. The function has `SECURITY DEFINER`.
- Option B: Grant `DELETE ON inbox_processed TO resto_app` in a new migration (narrow grant). Easier to write, easier to test, less scary than `SECURITY DEFINER`.

**Persona reviews did not lock this.** See Open Questions.

## Code Examples

### Suspend service (TEN-01 / TEN-03 — mirror of `archive-tenant.service.ts`)

```typescript
// apps/api/src/contexts/tenancy/application/suspend-tenant.service.ts — NEW
import { Inject, Injectable, Logger } from '@nestjs/common';
import { TenantId } from '@resto/domain';
import { TENANT_REPOSITORY, type TenantRepository } from '../domain/ports';
import { TenantNotFoundError } from '../domain/errors';
import type { TenantSnapshot } from '../domain/tenant.aggregate';

@Injectable()
export class SuspendTenantService {
  private readonly logger = new Logger(SuspendTenantService.name);

  constructor(
    @Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository,
  ) {}

  async suspend(input: {
    tenantId: string;
    requestedBy: string;
  }): Promise<TenantSnapshot> {
    const id = TenantId.parse(input.tenantId);
    const tenant = await this.repo.findById(id);
    if (!tenant) throw new TenantNotFoundError(input.tenantId);
    tenant.suspend(input.requestedBy);
    await this.repo.save(tenant);
    this.logger.warn(
      { tenantId: id, requestedBy: input.requestedBy },
      'Tenant suspended',
    );
    return tenant.toSnapshot();
  }

  async resume(input: { tenantId: string }): Promise<TenantSnapshot> {
    const id = TenantId.parse(input.tenantId);
    const tenant = await this.repo.findById(id);
    if (!tenant) throw new TenantNotFoundError(input.tenantId);
    tenant.resume();
    await this.repo.save(tenant);
    this.logger.log({ tenantId: id }, 'Tenant resumed');
    return tenant.toSnapshot();
  }
}
```

### TEN-02 customer-route check via decorator

```typescript
// apps/api/src/shared/auth/require-active-tenant.decorator.ts — NEW
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { RequireActiveTenantGuard } from './require-active-tenant.guard';

export const REQUIRE_ACTIVE_TENANT = 'require-active-tenant';
export const RequireActiveTenant = () =>
  applyDecorators(
    SetMetadata(REQUIRE_ACTIVE_TENANT, true),
    UseGuards(RequireActiveTenantGuard),
  );

// shared/auth/require-active-tenant.guard.ts
@Injectable()
export class RequireActiveTenantGuard implements CanActivate {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository,
  ) {}
  async canActivate(_ctx: ExecutionContext): Promise<boolean> {
    const tenant = await this.repo.findCurrentTenant();
    if (tenant?.toSnapshot().status === 'suspended') {
      throw new TenantSuspendedError(tenant.toSnapshot().id);
    }
    return true;
  }
}
```

Apply to `PublicMenuController.menu()` and `item()`.

### ESLint rule for TEN-15 (`no-restricted-syntax` selector)

```javascript
// packages/config-eslint/base.mjs — add to base rules
'no-restricted-syntax': [
  'error',
  // ... existing entries ...
  {
    selector:
      "Property[key.name='correlationId'] > CallExpression[callee.name='randomUUID']",
    message:
      'TEN-15 / ADR-0020 I-4: correlationId MUST come from buildEnvelope(). ' +
      'Direct randomUUID() loses the OTel trace link. Import buildEnvelope from @resto/events.',
  },
  {
    selector:
      "Property[key.name='correlationId'] > CallExpression[callee.object.name='crypto'][callee.property.name='randomUUID']",
    message:
      'TEN-15 / ADR-0020 I-4: correlationId MUST come from buildEnvelope(). ' +
      'Direct crypto.randomUUID() loses the OTel trace link. Import buildEnvelope from @resto/events.',
  },
],
```

## State of the Art

| Old Approach                                          | Current Approach                                              | When Changed                    | Impact                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------- |
| `runInTenantContext` from non-HTTP code               | `db.withTenantId(id, op)` / `db.withoutTenant(reason, op)`    | ADR-0020 I-6 (already enforced) | Phase 1 background jobs MUST follow the new shape           |
| Manual `correlationId: randomUUID()` literals         | `buildEnvelope(contract, payload, opts)` from `@resto/events` | TEN-14 in this phase            | All 8 named call sites migrate in PR 5                      |
| `withInboxDedup` three-tx wrapper                     | `runDeduped(db, env, consumer, async (tx) => ...)`            | ADR-0020 I-5 (already in tree)  | No change in Phase 1 — pattern is correct                   |
| Hand-rolled stop-promise in `OutboxDispatcher.stop()` | Cached `#stopPromise` returned by every caller                | TEN-16 in this phase            | 5-line change in `packages/events/src/outbox/dispatcher.ts` |

**Deprecated/outdated:**

- The `correlationId: randomUUID()` literal pattern is the documented "tech debt" line in `packages/events/CLAUDE.md` and `packages/db/CLAUDE.md`. TEN-14 + TEN-15 close it.
- `withInboxDedup` removed; do not re-introduce.

## Assumptions Log

| #   | Claim                                                                                                                                                                                 | Section                        | Risk if Wrong                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| A1  | TEN-02 should return **403 Forbidden** for active suspensions and reserve **410 Gone** for fully-erased tenants                                                                       | Anti-Patterns + Open Questions | Wrong HTTP semantics for the customer-facing surface; persona-investor sees this in a customer test                             |
| A2  | Boot-time `assertWithoutTenantCallsiteRegistered` is allowed to be a presence-check rather than a stack-walking call-time enforcer (per D-08 + Pitfall 6)                             | Pitfall 6                      | If "runtime assertion" was meant call-time, TEN-11 ships only half done                                                         |
| A3  | TEN-13 retention sweep runs under `resto_admin` (or via `SECURITY DEFINER`) because `resto_app` has no DELETE privilege                                                               | Pitfall 8 + Open Questions     | Sweep silently no-ops in prod; `inbox_processed` grows unbounded                                                                |
| A4  | Caret-pin `@nestjs/schedule@^4.1.2` is acceptable (vs exact pin like Better Auth)                                                                                                     | Standard Stack                 | Future minor bump could change `@Cron` behavior — but `@nestjs/schedule` v4 is stable                                           |
| A5  | TEN-09 "role-change" audit gap depends on a Better Auth hook that may or may not exist for role mutations (persona-skeptic flagged)                                                   | Persona Risk 5                 | Audit gap stays open; gap analysis must explicitly mark "role-change: blocked on BA hook surface" if no hookable surface exists |
| A6  | `STREAM_SUBJECTS` in `apps/api/src/infrastructure/nats.module.ts` already includes `tenancy.>` wildcard so new `tenant_suspended.v1` events flow through without subject-list changes | Runtime State Inventory        | If wildcards are too narrow, new event types silently fail to dispatch — verify before PR 3                                     |

## Open Questions (RESOLVED)

1. **TEN-02 status code: 403 or 410?**
   - What we know: ROADMAP success criterion says "403/410." Persona reviews silent on the choice.
   - What's unclear: which condition produces which code.
   - **RESOLVED:** 403 with `Retry-After` absent (suspended ≠ erased; 410 reserved for fully-erased tenants). Locked in `01-03-PLAN.md` → `<locked_open_questions>` truth #2.

2. **TEN-13 retention DELETE: `resto_admin` via SECURITY DEFINER, or narrow GRANT to `resto_app`?**
   - What we know: `resto_app` has no DELETE per project invariant. `inbox_processed` is the only legitimate sweep target.
   - What's unclear: which mechanism the project prefers.
   - **RESOLVED:** Narrow `GRANT DELETE ON inbox_processed TO resto_app` via migration 0028 (Option B over `SECURITY DEFINER`). Locked in `01-03-PLAN.md` Task 6 + `<locked_open_questions>` truth #3.

3. **TEN-02 implementation surface: middleware-level rejection, or per-controller decorator?**
   - What we know: persona reviews don't lock either approach. Decorator gives controllers opt-in; middleware blocks everything by default.
   - What's unclear: whether operator-facing routes need to be reachable while their own tenant is suspended.
   - **RESOLVED:** `@RequireActiveTenant()` decorator on `PublicMenuController` handlers; `TenantContextMiddleware` stays purely informational (just resolves tenant; does not enforce status). Locked in `01-03-PLAN.md` Task 5 + `<locked_open_questions>` truth #1.

4. **TEN-09 audit-gap.md format: table, checklist, or hybrid?**
   - What we know: existing GSD docs (`.planning/codebase/CONCERNS.md`) use markdown tables with `Sub-section / File / Issue / Severity / Status` columns.
   - What's unclear: what the planner wants for downstream review.
   - **RESOLVED:** Plain Markdown with `| Event | Currently Logged | Required Action |` table. Locked in `01-05-PLAN.md` Task 5.

5. **TEN-09 "role-change" gap closure — what's the BA hookable surface?**
   - What we know: persona-skeptic flagged that `role-change` may not have a hookable BA surface.
   - What's unclear: whether BA's `member` plugin emits a role-mutation hook, or whether the gap must be closed by intercepting the DB write directly.
   - **RESOLVED:** Use the existing identity-context outbox-publishing path (no new BA-internal hook surface). Locked in `01-05-PLAN.md` Task 5 audit-gap entry for role-change event.

6. **Is the existing `commit bdeb831` cross-tenant scaffold in `apps/api/test/e2e/cross-tenant-isolation.e2e.spec.ts` sequential or concurrent?**
   - What we know: CTO persona review flagged the file as already-present but did not confirm the 4 fixture categories.
   - What's unclear: which of the 4 categories the existing file covers.
   - **RESOLVED-AT-EXECUTION-TIME:** Plan 06 Task 0 explicitly inventories `apps/api/test/e2e/cross-tenant-isolation.e2e.spec.ts` against the 4 fixture categories from D-07 and writes the gap analysis to `audit-gap-test-scaffold.md` before Tasks 1-4 begin. The OQ is closed by the executor as the first action of Plan 06.

## Environment Availability

Phase 1 is brownfield NestJS work — most dependencies are in-tree. New external dependency:

| Dependency                                     | Required By                                   | Available                                  | Version                     | Fallback                                                                            |
| ---------------------------------------------- | --------------------------------------------- | ------------------------------------------ | --------------------------- | ----------------------------------------------------------------------------------- |
| `@nestjs/schedule`                             | TEN-05/06, TEN-13                             | will install                               | `^4.1.2` (new)              | —                                                                                   |
| Docker                                         | TEN-08 (integration tests use testcontainers) | ✓ (already in dev)                         | —                           | Skip TEN-08 tests with the existing `isDockerAvailable()` gate; CI must have Docker |
| Postgres 16                                    | All tests                                     | ✓ via testcontainers + dev compose         | 16-alpine                   | —                                                                                   |
| NATS 2.10                                      | TEN-08 NATS-mix fixture, existing e2e tests   | ✓ via `with-real-stack.setup.ts`           | 2.10-alpine                 | —                                                                                   |
| OTel SDK                                       | TEN-06 error spans, TEN-10 labels             | ✓ already wired (`bootstrap-telemetry.ts`) | per `apps/api/package.json` | —                                                                                   |
| `@nestjs/schedule` peer-dep `@nestjs/core ^10` | TEN-05/06/13                                  | ✓                                          | `^10.4.15`                  | —                                                                                   |

**Missing dependencies with no fallback:** none — `@nestjs/schedule` is a straight `pnpm add`.

**Missing dependencies with fallback:** none.

## Discovered Patterns (planner reuse map)

| Need in Phase 1                                   | Existing analog file                                                                                                                                           | Migration shape                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| New aggregate state transition (TEN-01/03)        | `apps/api/src/contexts/tenancy/domain/tenant.aggregate.ts:archive()` / `scheduleOffboarding()`                                                                 | Copy method body shape; add error class in `errors.ts`                                  |
| New domain event (TEN-04)                         | `apps/api/src/contexts/tenancy/domain/events.ts:TenantArchivedDomainEvent`                                                                                     | Add new interface; extend union; extend `domainEventToEnvelope` switch                  |
| New event contract (TEN-04)                       | `packages/events/src/contracts/tenancy.ts:TenantArchivedV1`                                                                                                    | Add Zod payload + `defineEventContract`; re-export from `packages/events/src/index.ts`  |
| New application service (TEN-01/03)               | `apps/api/src/contexts/tenancy/application/archive-tenant.service.ts`                                                                                          | Copy shape — `@Injectable`, `@Inject(TENANT_REPOSITORY)`, single async public method    |
| New internal HTTP route (TEN-01/03)               | `apps/api/src/contexts/tenancy/interfaces/http/internal-tenants.controller.ts:archive`                                                                         | Add `@Post(':id/suspend')` and `@Post(':id/resume')` mirror methods                     |
| Error → HTTP mapping (TEN-02)                     | `apps/api/src/contexts/tenancy/interfaces/http/error-mapping.ts:mapDomainError`                                                                                | Add `if (err instanceof TenantSuspendedError) return new ForbiddenException(...)`       |
| New boot preflight (TEN-07, TEN-11)               | `packages/db/src/preflight.ts:assertNoRlsBypass`                                                                                                               | Mirror function + custom error class; call from `apps/api/src/main.ts` after existing 3 |
| New cron service (TEN-05/06, TEN-13)              | n/a (NEW pattern in this codebase)                                                                                                                             | Per code example above; `@Cron('0 2 * * *', { timeZone: 'UTC' })`                       |
| New ESLint rule (TEN-12/15)                       | `packages/config-eslint/base.mjs` (`no-restricted-syntax`) — many existing entries                                                                             | Append new selectors; document with TEN-xx reference                                    |
| Docker test stack (TEN-08)                        | `infra/docker/docker-compose.dev.yml`                                                                                                                          | Copy + reduce resource limits + ephemeral volumes                                       |
| Integration test (TEN-08, TEN-07 boot, TEN-16/17) | `packages/db/test/integration/auth-role-grants.spec.ts`, `packages/db/test/integration/tenant-isolation.spec.ts`, `apps/api/test/e2e/with-real-stack.setup.ts` | All three are templates depending on scope (db-only vs api-stack)                       |
| `runDeduped` consumer (audit closure for TEN-09)  | `apps/api/src/contexts/audit/infrastructure/nats-audit-subscriber.ts`                                                                                          | Extend `ACTION_TARGET_KIND` map in `record-audit.service.ts` for new event types        |
| Outbox-test pattern (TEN-17 validation)           | `packages/events/test/integration/outbox-roundtrip.spec.ts`                                                                                                    | Add malformed-envelope case that asserts parse error + no row insert                    |
| OTel metric emission (TEN-10)                     | `apps/api/src/infrastructure/outbox-dispatcher.service.ts:deliveredCounter.add(1, { 'event.type': ... })`                                                      | Extend the existing `{ 'event.type': ... }` attribute bag to include `'tenant.id'`      |
| Outbox `stop()` test pattern                      | `apps/api/test/e2e/outbox-dispatcher.e2e.spec.ts` (159 lines)                                                                                                  | Add concurrent-`stop()` test that asserts both callers' promises resolve                |

## Cross-cutting Validation Architecture

Multiple TEN-xx reqs share test infrastructure. The planner should create test scaffolding **once in PR 2** (Group 1 / Docker stack) rather than letting each PR build ad-hoc.

### Test framework (already in tree — no decisions needed)

| Property             | Value                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| Framework            | Vitest 2.1.8                                                                                                 |
| Config files         | `apps/api/vitest.config.ts`, `packages/db/vitest.config.ts`, `packages/events/vitest.config.ts`              |
| Quick run command    | `pnpm test` (Nx-orchestrated across affected packages)                                                       |
| Per-file integration | `pnpm vitest run <path>`                                                                                     |
| Docker gate          | `isDockerAvailable()` helper in `packages/db/test/setup.ts` and `apps/api/test/e2e/with-real-stack.setup.ts` |

### Shared infrastructure to build in PR 2

1. **`infra/docker/docker-compose.test.yml`** — Postgres 16 + NATS 2.10 with ephemeral volumes; matches dev compose service names.
2. **`scripts/test-stack.{sh,mjs}`** — convenience wrapper for CI: `pnpm test:stack up`, `pnpm test:stack down`. Optional — testcontainers already manage lifecycle; a compose stack is only useful if you want a long-running test env for manual investigation.
3. **No new harness file needed** — `apps/api/test/e2e/with-real-stack.setup.ts` already starts Postgres + NATS testcontainers and a full NestJS app. Use as-is for HTTP-level TEN-08 fixtures.

### TEN-08 fixture matrix (PR 6 — phase gate)

| Fixture                                 | File location (proposed)                                     | Test type                                                               | What it proves                                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ALS leak across async boundary          | `apps/api/test/e2e/cross-tenant-als-leak.e2e.spec.ts`        | e2e (HTTP-level concurrent requests)                                    | Two `Promise.all` HTTP requests under different tenants see only their own data; assert 100× run in CI                                                    |
| NATS subscriber tenant-context mix      | `apps/api/test/e2e/cross-tenant-nats-mix.e2e.spec.ts`        | e2e (publish A/B/A/B; assert each handler sees its envelope's tenantId) | `runDeduped` + handler always processes the correct tenant despite interleaved delivery                                                                   |
| Concurrent-write race                   | `packages/db/test/integration/concurrent-write-race.spec.ts` | integration (real Postgres)                                             | `Promise.all` writes under different tenants commit cleanly; no GUC drift detected                                                                        |
| Cross-tenant read-leak (raw tx mistake) | `packages/db/test/integration/raw-tx-rls-fence.spec.ts`      | integration                                                             | Deliberately omitting `WHERE tenant_id` from a `tx.select()` returns ONLY the bound tenant's rows (proves RLS catches what ScopedTx would have prevented) |

### Per-PR test pairing

| PR                                              | Test artifact required                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR 1 (TEN-16/17)                                | Extend `packages/events/test/integration/outbox-roundtrip.spec.ts` + add `dispatcher-stop-idempotent.spec.ts`                                                                                                                                                                                              |
| PR 2 (Docker stack)                             | Spec-level test that confirms the stack starts (optional — CI itself is the test)                                                                                                                                                                                                                          |
| PR 3 (suspend lifecycle + cron + buildEnvelope) | Unit tests for `Tenant.suspend()/resume()` in `apps/api/test/unit/tenancy/`; e2e in `apps/api/test/e2e/tenancy-suspend.e2e.spec.ts`; cron schema test for `TenantErasureSchedulerService` (mock `SchedulerRegistry`); `buildEnvelope` unit + integration test (ALS-bound vs no-ALS fallback log assertion) |
| PR 4 (preflight + lint)                         | Boot preflight unit test in `packages/db/test/integration/preflight-ba-creds.spec.ts`; ESLint rule test via `packages/config-eslint/test/` snapshot test                                                                                                                                                   |
| PR 5 (TEN-09 + TEN-14 migration + TEN-10)       | Update `apps/api/test/e2e/identity-audit.e2e.spec.ts` for new audit rows; add OTel label assertion to `outbox-dispatcher.e2e.spec.ts`                                                                                                                                                                      |
| PR 6 (TEN-08)                                   | The 4 fixtures above                                                                                                                                                                                                                                                                                       |

## Security Domain

`security_enforcement` is enabled by default. This phase is fundamentally a security-hardening phase, so the controls apply to almost every TEN-xx.

### Applicable ASVS Categories

| ASVS Category               | Applies        | Standard Control                                                                                                                                                                               |
| --------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication           | yes            | Better Auth (already deployed); TEN-07 ensures DB role separation; TEN-18 already pins exact version                                                                                           |
| V3 Session Management       | yes (indirect) | Better Auth session/cookie config (Phase 3 AUTH-08); Phase 1 only touches `signed_in` / `signed_out` audit emission                                                                            |
| V4 Access Control           | yes            | TEN-01/02/03 suspend lifecycle is a tenant-level access control; `InternalTokenGuard` already exists for `/internal/v1/*`; `PermissionsGuard` continues to apply                               |
| V5 Input Validation         | yes            | `nestjs-zod` `RestoZodValidationPipe` per controller; new `SuspendInputDto` and `ResumeInputDto` get this treatment; TEN-17 `EventEnvelope.parse()` is input validation at the outbox boundary |
| V6 Cryptography             | yes (indirect) | `AUDIT_ERASURE_SALT` already in env schema; no new crypto introduced                                                                                                                           |
| V7 Error Handling & Logging | yes            | TEN-06 OTel error span + WARN log; TEN-09 audit rows for all critical actions; `ProblemDetailsFilter` redacts 5xx `detail`                                                                     |
| V8 Data Protection          | yes            | TEN-05/06 GDPR erasure scheduler; TEN-13 inbox retention (data-minimization)                                                                                                                   |
| V10 Communications          | yes (indirect) | TLS termination at the edge (out of phase scope); internal NATS over plain TCP in dev is fine                                                                                                  |
| V12 File and Resources      | n/a            | No file uploads in Phase 1                                                                                                                                                                     |
| V14 Configuration           | yes            | `assertProdGuardrails` (existing), TEN-07 boot preflight, TEN-11 boot preflight; `assertEmailAdapterWired` (existing)                                                                          |

### Known Threat Patterns for `apps/api` + tenancy/identity

| Pattern                                                       | STRIDE                             | Standard Mitigation                                                                                |
| ------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| Cross-tenant data leak via missing `WHERE tenant_id`          | Information Disclosure             | `ScopedTx` (application) + RLS (database) double-enforcement; TEN-08 regression net                |
| ALS context bleed across concurrent requests                  | Information Disclosure             | `runInTenantContext` HTTP-middleware-only rule (ADR-0020 I-6); TEN-08 ALS leak fixture             |
| GUC re-bind to a different tenant inside a `withTenant` block | Elevation of Privilege             | RES-243 `app_bind_tenant` SECURITY DEFINER wrapper + drift sentinel (existing)                     |
| `set_config` forge via raw SQL                                | EoP                                | RES-243 REVOKE on `pg_catalog.set_config`; `assertSetConfigRevoked` boot check (existing)          |
| BA credential exposure via `resto_app` read                   | Information Disclosure             | Migration 0027 + TEN-07 `assertNoBaCredentialAccess` boot check                                    |
| Outbox row insert with malformed payload bypassing schema     | Tampering                          | TEN-17 `EventEnvelope.parse()` at insert                                                           |
| Background job loses tenant context, writes to wrong tenant   | Tampering                          | `db.withTenantId(tenantId, ...)` explicit binding in cron handlers; TEN-11 allowlist runtime check |
| Suspended tenant continues to serve guest orders              | Authentication / Access Control    | TEN-01..04 suspend lifecycle + TEN-02 enforcement at customer-facing routes                        |
| Direct `correlationId: randomUUID()` breaks trace correlation | Repudiation (debugging impossible) | TEN-14 `buildEnvelope` + TEN-15 ESLint guard                                                       |
| `inbox_processed` grows unbounded → DoS via slow query        | Denial of Service                  | TEN-13 retention sweep                                                                             |

## Sources

### Primary (HIGH confidence)

- Local codebase reads (verified — files inspected line-by-line):
  - `packages/events/src/outbox/dispatcher.ts` (TEN-16 site, lines 118-141)
  - `packages/events/src/outbox/repository.ts` (TEN-17 site, line 23)
  - `packages/events/src/envelope.ts` (`EventEnvelope` schema, `defineEventContract`)
  - `packages/events/src/correlation.ts` (`getCorrelationId` ALS reader — required by TEN-14)
  - `packages/events/src/contracts/tenancy.ts` (existing event contracts — template for TEN-04)
  - `packages/events/src/index.ts` (no `buildEnvelope` export — confirms TEN-14 is new)
  - `packages/db/src/preflight.ts` (existing assertion family — template for TEN-07, TEN-11)
  - `packages/db/src/client.ts` (`TenantAwareDb`, `withoutTenant` at lines 279-290)
  - `packages/db/src/withoutTenant.allowlist.ts` (existing allowlist for TEN-11/12)
  - `packages/db/migrations/0027_revoke_resto_app_ba_credential_tables.sql` (TEN-07 already-shipped foundation)
  - `packages/db/test/integration/auth-role-grants.spec.ts` (TEN-07 already-shipped integration test)
  - `packages/db/test/integration/tenant-isolation.spec.ts` (canonical RLS regression test — template for TEN-08)
  - `packages/db/test/setup.ts` (`startPostgres()` testcontainer pattern)
  - `apps/api/src/main.ts` (boot preflight chain — TEN-07/11 insertion point)
  - `apps/api/src/contexts/tenancy/domain/tenant.aggregate.ts` (existing aggregate — template for suspend/resume)
  - `apps/api/src/contexts/tenancy/domain/events.ts` (existing domain events — template for TEN-04)
  - `apps/api/src/contexts/tenancy/domain/errors.ts` (error class shapes)
  - `apps/api/src/contexts/tenancy/application/offboard-tenant.service.ts` (existing `executeErasure` — TEN-05/06 wraps this)
  - `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts` (5 envelope-construction sites at lines 296/312/323/338/352)
  - `apps/api/src/contexts/tenancy/interfaces/http/internal-tenants.controller.ts` (HTTP route pattern)
  - `apps/api/src/contexts/tenancy/interfaces/http/error-mapping.ts` (domain → HTTP error mapping pattern)
  - `apps/api/src/contexts/identity/identity-core.module.ts` (3 envelope-construction sites at lines 106/122/147)
  - `apps/api/src/contexts/identity/infrastructure/identity-event-emitter.adapter.ts` (system-context emitter pattern)
  - `apps/api/src/contexts/audit/audit.module.ts`, `application/record-audit.service.ts`, `infrastructure/nats-audit-subscriber.ts` (audit pipe — TEN-09 closure surface)
  - `apps/api/src/infrastructure/outbox-dispatcher.service.ts` (existing OTel metrics emission — TEN-10 site)
  - `apps/api/src/shared/tenant-context.middleware.ts` (TEN-02 integration point)
  - `apps/api/test/e2e/with-real-stack.setup.ts`, `cross-tenant-isolation.e2e.spec.ts`, `outbox-dispatcher.e2e.spec.ts` (TEN-08 test templates)
  - `apps/api/eslint.config.mjs` (existing `no-restricted-syntax` rules — TEN-12/15 insertion point)
  - `packages/config-eslint/base.mjs` (ESLint base — TEN-15 candidate location)
  - `infra/docker/docker-compose.dev.yml` mention (TEN-08 D-06 template — file not read but path verified)
- `.planning/phases/01-tenancy-hardening/01-CONTEXT.md` (all 15 locked decisions)
- `.planning/phases/01-tenancy-hardening/01-PERSONA-REVIEWS.md` (investor + CTO + skeptic findings)
- `.planning/REQUIREMENTS.md` (TEN-01..TEN-18 wording)
- `.planning/ROADMAP.md` Phase 1 section (success criteria)
- `.planning/STATE.md` (project state, planning-only mode)
- `apps/api/package.json` (dependency versions; `better-auth: =1.4.22` confirms TEN-18 done)
- `packages/CLAUDE.md`, `packages/events/CLAUDE.md`, `packages/db/CLAUDE.md`, `apps/CLAUDE.md`, root `CLAUDE.md` (all auto-loaded into this session)

### Secondary (MEDIUM confidence)

- `npm view @nestjs/schedule@4.1.2 version peerDependencies` — confirms peer-dep compatibility with NestJS 10
- `npm view @nestjs/schedule@4.1.2 description repository.url` — confirms canonical `nestjs/schedule` repo
- Conventional `@Cron` decorator usage from `@nestjs/schedule` documentation (training-data knowledge, well-established API)

### Tertiary (LOW confidence — none used as load-bearing)

- WebFetch to npmjs.com — returned 403, did not contribute findings

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — every recommended library is already in tree or (for `@nestjs/schedule`) verified via npm registry against an authoritative repo
- Architecture: HIGH — patterns are read from the actual codebase, not invented
- Pitfalls: HIGH — pitfalls 1, 2, 3, 6, 7, 8 are derived from direct code inspection; 4, 5 are derived from persona-skeptic's explicit flags

**Research date:** 2026-05-26
**Valid until:** 2026-06-25 (30 days — codebase is stable; only `@nestjs/schedule` is a moving piece, and it's at the end of its v4 line)
