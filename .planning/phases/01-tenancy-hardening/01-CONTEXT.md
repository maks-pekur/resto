# Phase 1: Tenancy Hardening - Context

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Close every enterprise, GDPR, and security gap in the existing `tenancy` and `identity` bounded contexts of `apps/api` — and the supporting `packages/db` + `packages/events` infrastructure they ride on — before any net-new product surface (admin shell, ordering, payments, etc.) is built on top.

This phase is **pure platform work**: no UI, no customer-facing surface, no new bounded context. Scope = closing the 18 TEN-\* requirements identified in `REQUIREMENTS.md` (TEN-01 through TEN-18). Several are bug fixes to known-broken code; several are net-new behavior (`buildEnvelope`, boot preflight for BA-credentials, runtime allowlist enforcement, ESLint rules, Docker-stack integration tests).

After this phase, `tenancy` and `identity` are at the "production-enterprise" bar — multi-tenant safety is demonstrably enforced at the application AND database AND test layers; GDPR erasure runs without human intervention; observability is per-tenant; outbox is bug-free and idempotent; auth credentials are isolated from runtime role; and every cross-tenant bypass is audited or rejected.

</domain>

<decisions>
## Implementation Decisions

### Scope strategy

- **D-01:** Phase 1 is **monolithic** — all 18 TEN-\* requirements (TEN-01 through TEN-18) ship together as one phase. Investor's proposed 60/40 split into Phase 1 + Phase 1.1 (after first LOI) was considered and rejected: the 18 reqs are architecturally coupled (audit completeness depends on `buildEnvelope`; runtime allowlist depends on audit completeness; cross-tenant tests depend on Docker fixtures which support everything). Cutting reduces effort but raises rework risk later.
- **D-02:** Estimated **9–12 working days solo** (per CTO analysis). Plan must size honestly — under-estimating raises the risk that TEN-08 (cross-tenant test net) ships at MVP-quality instead of production-quality, and TEN-08 is the last line of defense against cross-tenant data leaks.

### TEN-18 — Better Auth exact pin (✓ DONE outside phase planning)

- **D-03:** TEN-18 was completed as a standalone commit (`19a9da2`, 2026-05-25) before Phase 1 planning starts. `apps/api/package.json` updated: `"better-auth": "~1.4.22" → "=1.4.22"` and `"@better-auth/cli": "~1.4.22" → "=1.4.22"`. All 3 personas (CTO, Skeptic, Investor) agreed this is a 1-line change, not a phase deliverable. The plan does not need to include TEN-18 as a task; verify in DOR check that the commit is on the branch.

### Order of operations (PR sequencing)

- **D-04:** Phase 1 ships across **6 PRs grouped by dependency**, executed sequentially:
  - **PR 1 (Group 0 — bug fixes):** TEN-16 (`OutboxDispatcher.stop()` idempotency: cache stop-promise; CONCERNS file `packages/events/src/outbox/dispatcher.ts:118-124`), TEN-17 (`appendToOutbox` calls `EventEnvelope.parse(options.envelope)` at top before insert; file `packages/events/src/outbox/repository.ts:23`). These two unblock everything else — TEN-16 stops test-teardown flake from masking TEN-08 failures.
  - **PR 2 (Group 1 — test infrastructure):** Docker Compose stack for integration tests (Postgres + NATS); see D-06 below.
  - **PR 3 (Group 2 — feature work, parallelizable internally):**
    - TEN-01..04 (suspend lifecycle: domain transition, customer endpoint blocking, resume, audit events)
    - TEN-05/06 + TEN-13 (one `BackgroundJobsModule` covering erasure scheduler, retention sweep — see D-11)
    - TEN-14 (`buildEnvelope` helper)
  - **PR 4 (Group 3 — enforcement):** TEN-07 (BA-creds boot preflight assertion), TEN-11 (runtime allowlist for `withoutTenant` — see D-08), TEN-12 + TEN-15 (ESLint `no-restricted-syntax` rules — see D-09).
  - **PR 5 (Group 4 — observability + gap close):** TEN-09 (audit gap analysis + closure in `tenancy` + `identity` only), TEN-10 (per-tenant OTel label emission — see D-07).
  - **PR 6 (Group 5 — test net, GATES THE PHASE):** TEN-08 (4 fixture categories using the Docker stack from PR 2). Phase is not "done" until this PR's tests are green on CI.

### TEN-10 — per-tenant OTel metric strategy

- **D-05:** **Emit `tenant_id` label now on outbox lag, HTTP request rate, error rate** (CTO middle-ground). The label-emission code is a permanent architectural commitment — the metric series shape gets baked in now and changing it later requires renaming metrics + downstream dashboard rewires. The label code itself is ~2 hours of work in existing OTel instrumentation. **Defer all dashboard/alert/cardinality-ceiling work to Phase 1.1 or to the 20+ tenant scaling event.** Plan documents the cardinality ceiling as a known scaling gate but does not implement dashboards.

### TEN-08 — cross-tenant test infrastructure

- **D-06:** **Full Docker Compose stack** for integration tests (Postgres 16 + NATS 2.10). Reuse the existing `infra/docker/docker-compose.dev.yml` pattern; spin up a separate `docker-compose.test.yml` for CI (smaller resource profile, ephemeral volumes). Mock-heavy tests cannot trust ALS leak detection or NATS subscriber tenant context mix — these failures only manifest with real async boundaries.
- **D-07:** TEN-08 success criterion = **4 fixture categories** (all must be implemented; partial = not done):
  1. **ALS leak fixture** — spawn two concurrent tenant-context requests; verify Postgres `app_bind_tenant` GUC values do not bleed across the async boundary
  2. **NATS subscriber tenant-context mix fixture** — publish events from tenant A and tenant B interleaved; verify `runDeduped` + handler always sees the correct tenant context for the event being processed
  3. **Concurrent-write race fixture** — two parallel writers to the same tenant-scoped table; verify composite FK + RLS hold under contention
  4. **Cross-tenant read-leak fixture** — verify that `WHERE tenant_id` predicate omission (e.g., a future raw `tx.select()` mistake) is blocked by RLS even when application-layer `ScopedTx` would have prevented it

### TEN-11 — runtime allowlist enforcement model

- **D-08:** **Startup assertion** (not call-time throw) — `db.withoutTenant(reason, fn)` validates that the calling code path is registered in the allowlist at boot, consistent with the `assertNoRlsBypass` / `assertTenantLockInstalled` / `assertSetConfigRevoked` family already in `packages/db/src/preflight.ts`. Boot fails fast if an unregistered call site exists. Call-time throw would only surface cold-path violations in production — startup assertion catches them in CI/dev.

### TEN-12 + TEN-15 — ESLint approach

- **D-09:** **`no-restricted-syntax` overrides in `packages/config-eslint/`**, not a custom `eslint-plugin-resto` package. Both rules are AST patterns (forbidden function call signature for TEN-12; forbidden object literal shape for TEN-15) achievable with built-in `no-restricted-syntax`. Total work ~2 hours; custom plugin would be ~2 days for the same enforcement. If future RestOS-specific lints justify a plugin, migrate at that time.

### TEN-14 — `buildEnvelope` fallback when no OTel span is active

- **D-10:** **Fallback to `randomUUID()` + WARN log** when no active OTel span exists at construction time (Option B per CTO). Affected call sites: erasure scheduler (TEN-05/06), inbox retention sweep (TEN-13), any future cron-emitted event. The WARN log surfaces "envelope built without trace context" for forensics. Explicit-correlationId threading (Option C) is documented as the upgrade path but deferred — solo throughput does not justify the upfront cost.

### TEN-05/06 — erasure scheduler failure strategy

- **D-11:** **Continue-on-error per tenant** — each tenant erasure is independent. A failure for tenant A must not block erasures for tenants B, C, D. Halt-on-first-failure creates head-of-line blocking that breaks GDPR SLA compliance for the entire queue. Implementation:
  - One `@Cron('0 2 * * *')` daily at 02:00
  - Iterates `listScheduledForErasure()` results
  - Each iteration in its own try/catch; failure → OTel error span + WARN log with tenant_id, continue to next
  - Aggregate "N of M succeeded, K failed" log line at end of run
- **D-12:** Same scheduler module hosts TEN-13 (`inbox_processed` retention sweep) and TEN-05/06 (erasure scheduler). Single `BackgroundJobsModule` instead of two — pays the `ScheduleModule` setup cost once.

### TEN-07 — BA-credential boot assertion scope

- **D-13:** **Minimum 12-check assertion** at boot — `SELECT`, `INSERT`, `UPDATE` privileges checked via `has_table_privilege('resto_app', '<table>', '<priv>')` for all four BA tables (`account`, `session`, `two_factor`, `verification`). Table-level checks alone miss column-level grants and role-inheritance chains. Assertion lives in `packages/db/src/preflight.ts` as `assertNoBaCredentialAccess`, called from `apps/api/src/main.ts` preflight chain (currently has 3 assertions; this becomes the 4th).

### TEN-09 — audit-completeness gap-analysis scope

- **D-14:** **Scope to `tenancy` + `identity` contexts only** (per CTO). The 8 critical actions: `provision`, `archive`, `offboard`, `suspend`, `erase`, `sign-in`, `sign-out`, `role-change`. Gap analysis written to `.planning/phases/01-tenancy-hardening/audit-gap.md` (created during planning) and gaps closed. `catalog` audit coverage is **explicitly deferred to Phase 4** (where catalog admin UX ships). Audit on `ordering` waits for Phase 7. Scope creep into other contexts is rejected.
- **D-15:** TEN-09 and TEN-14 (`buildEnvelope`) touch the same files in `apps/api/src/contexts/identity/identity-core.module.ts` (line refs in CONCERNS). They MUST be implemented in **one PR** to avoid merge conflicts mid-PR-3.

### Claude's Discretion

- **Planner decides:** which test runner library to use for the Docker-backed integration tests (likely Vitest with custom `setupFiles` per existing `packages/db/test/integration/` conventions — see CONVENTIONS.md), the exact CI job structure for the Docker stack (one job vs. matrix), and the specific OTel metric names/units for TEN-10 (follow existing Pino metric naming patterns).
- **Researcher should investigate:** NestJS `@nestjs/schedule` `@Cron` decorator timezone handling (production runs in UTC but EU operators expect local-time semantics for "02:00 daily"); idempotency strategy if the cron fires twice during a deploy window (advisory lock pattern reused from outbox dispatcher).
- **Planner decides:** structure of `audit-gap.md` (markdown table vs. checklist) — researcher's output should suggest a format based on existing GSD audit documents.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level (locked decisions)

- `.planning/PROJECT.md` — RestOS context, persona convention, Key Decisions table; especially the locked monetization model and the "GSD as single source of truth" reset
- `.planning/REQUIREMENTS.md` §Tenancy (`TEN`) — all 18 TEN-\* requirements with exact wording. TEN-16/17/18 are NOT in the original CONCERNS list; they were added during persona review and are the highest-leverage quick wins
- `.planning/ROADMAP.md` §Phase 1 — goal, success criteria, persona reviewer assignments

### Persona findings driving this phase

- `.planning/phases/01-tenancy-hardening/01-PERSONA-REVIEWS.md` — Investor + CTO + Skeptic reviews specifically for Phase 1. **The planner MUST read all three.** Each persona names specific files, line numbers, and risk patterns the plan must address.
- `.planning/PERSONA-REVIEWS.md` — project-level review from initial roadmap; CTO's "Phase ordering concerns" section flags the outbox claim-token race as a Phase 7 prerequisite, but the underlying outbox bugs (TEN-16, TEN-17) are Phase 1 work

### Codebase reality (drives concrete file-level work)

- `.planning/codebase/CONCERNS.md` — most TEN reqs trace to specific issues here. Critical sub-sections: "Tech Debt" (outbox dispatcher, BCP-47 regex duplication), "Known Bugs" (`OutboxDispatcher.stop()` deadlock), "Security Considerations" (cookie flags — though those are Phase 2/3 not Phase 1)
- `.planning/codebase/ARCHITECTURE.md` §Architectural Constraints + §Anti-Patterns — defines `withoutTenant` rule, `runInTenantContext` HTTP-only rule, `correlationId` via OTel span rule (TEN-14 implements the helper that enforces this)
- `.planning/codebase/STACK.md` — locked stack; planner picks tools (Vitest, NestJS Schedule, etc.) only from packages already in dependency tree
- `.planning/codebase/CONVENTIONS.md` — testing patterns, error handling, DI patterns; D-15 (planner uses existing patterns for Docker test fixtures)
- `.planning/codebase/TESTING.md` — existing integration test conventions in `packages/db/test/integration/` are the template for TEN-08 fixtures

### File-level refs explicitly named by persona findings

- `packages/events/src/outbox/dispatcher.ts:118-124` — TEN-16 deadlock site
- `packages/events/src/outbox/repository.ts:23` — TEN-17 missing `EventEnvelope.parse()`
- `packages/events/src/outbox/repository.ts:110-128` — `releaseOutboxClaim` claim-token race (NOT in Phase 1 — Phase 7 work, but planner should be aware of the boundary)
- `packages/db/src/preflight.ts` — TEN-07 + TEN-11 boot assertions added here, follow existing `assertNoRlsBypass` / `assertTenantLockInstalled` / `assertSetConfigRevoked` pattern
- `apps/api/src/main.ts` — TEN-07 assertion called from here (4th preflight)
- `apps/api/src/contexts/identity/identity-core.module.ts:110,127,151` — TEN-09 + TEN-14 implementation site (8 call sites to migrate to `buildEnvelope`)
- `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts:300,316,327,342,356` — additional TEN-14 call sites
- `packages/db/src/withoutTenant.allowlist.ts` — existing allowlist constant; TEN-11 wires it to runtime + TEN-12 ESLint references it
- `packages/db/src/client.ts:279-290` — `withoutTenant` current behavior (logs WARN only); TEN-11 changes this
- `packages/db/migrations/0027_*.sql` + `packages/db/test/integration/auth-role-grants.spec.ts` — already-shipped foundation for TEN-07; the boot assertion is the missing half
- `apps/api/src/contexts/tenancy/application/offboard-tenant.service.ts:61` — TEN-05/06 `executeErasure` exists; cron wrapper is what's missing
- `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts:160-177` — `listScheduledForErasure()` exists
- `apps/api/src/infrastructure/nats.module.ts` — TEN-10 OTel labels emitted from outbox dispatcher metrics already wired here
- `packages/config-eslint/base.mjs` — TEN-12 + TEN-15 `no-restricted-syntax` rules added here
- `packages/events/src/correlation.ts` — `getCorrelationId()` ALS reader exists; TEN-14 `buildEnvelope` consumes it

### Persona lenses (founder's brief for ongoing reviews)

- `SPEC.md` §8.1 — RestOS CTO lens (multi-tenancy correctness, peak Friday load, POS-abstraction port, GDPR/PCI, build-vs-buy, observability, dev velocity bounded by solo throughput)
- `SPEC.md` §8.3 — RestOS Skeptic lens (hidden assumptions, premature optimization, MVP omissions, over-engineering, partial-integration quicksand)
- `SPEC.md` §8.4 — RestOS Investor lens (TAM, CAC/LTV, capital efficiency, moat, regulatory exposure, dependency risk, pricing)

### Cross-cutting CLAUDE.md guidance

- `/Users/mp_dev/.claude/CLAUDE.md` — user-global rules (commit conventions, no Claude attribution, task workflow)
- `apps/CLAUDE.md` — app-layer rules (`secure: production` cookie flag, no `localhost` env fallbacks, source maps `'hidden'` only — most relevant to Phase 2/3 but Phase 1 must not regress these)
- (Per-context `CLAUDE.md` files inside `apps/api/src/contexts/*/CLAUDE.md` if they exist — planner should check)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`packages/db/src/preflight.ts`** — pattern for boot-time assertions. TEN-07 (`assertNoBaCredentialAccess`) and TEN-11 (`assertWithoutTenantCallsiteRegistered`) follow the existing `assertNoRlsBypass` / `assertTenantLockInstalled` / `assertSetConfigRevoked` shape. Same registration order in `apps/api/src/main.ts`.
- **`packages/events/src/correlation.ts:getCorrelationId()`** — already reads `correlationId` from ALS. TEN-14 `buildEnvelope` calls this directly; no need to re-wire ALS access.
- **`packages/db/src/withoutTenant.allowlist.ts`** — allowlist constant already exists for documentation. TEN-11 promotes it to runtime enforcement; TEN-12 references it from the ESLint rule.
- **`packages/db/test/integration/auth-role-grants.spec.ts`** — existing integration test for BA-credential isolation. Pattern for TEN-08 fixture: real Postgres + role-based test user + privilege assertions.
- **`apps/api/src/contexts/tenancy/application/offboard-tenant.service.ts:executeErasure`** + **`apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts:listScheduledForErasure`** — TEN-05/06 needs only a `@Cron` wrapper around these; the business logic is already correct.
- **`apps/api/src/infrastructure/outbox-dispatcher.service.ts`** — already exposes OTel metrics (`delivered_counter`, `lag_histogram`, `claim_failures_counter`). TEN-10 adds `tenant_id` label to these existing series, not new metrics.
- **`infra/docker/docker-compose.dev.yml`** — template for `docker-compose.test.yml` per D-06. Same Postgres + NATS containers, different volumes, ephemeral.

### Established Patterns

- **DDD 4-layer structure** (`domain / application / infrastructure / interfaces/http`) — TEN-01..04 suspend lifecycle adds: `SuspendTenantService` (application layer), `Tenant.suspend()` aggregate method (domain), updated `error-mapping.ts` (interfaces). No new bounded context.
- **Symbol-keyed DI ports** — TEN-14 `buildEnvelope` is a free function, not a port (no DI substitution needed). Lives in `packages/events/src/envelope.ts` alongside the existing `defineEventContract`.
- **`@nestjs/schedule` `@Cron` decorator** — used elsewhere in NestJS conventions; D-12 single `BackgroundJobsModule` is the new module that hosts cron jobs.
- **Event contracts versioned `<context>.<noun>_<verb>.v<n>`** — TEN-04 adds `tenancy.tenant_suspended.v1` and `tenancy.tenant_resumed.v1` to `packages/events/src/contracts/tenancy.ts`.
- **Composite FK `(parent_id, tenant_id)`** — already enforced; suspend lifecycle adds no new tables, only new column states.
- **Soft-delete via `status` enum** — `'suspended'` already exists in `TenantStatus` (domain layer) per CONCERNS; no migration needed for the status itself, just the service.

### Integration Points

- **`TenantContextMiddleware`** (`apps/api/src/shared/tenant-context.middleware.ts`) — TEN-02 (suspended tenant blocks customer endpoints) integrates here: after tenant resolution, if `tenant.status === 'suspended'`, throw a typed exception (`TenantSuspendedError`) that maps to HTTP 403 in `interfaces/http/error-mapping.ts`. Public endpoints (`@Public()` on PublicMenuController) also check this.
- **`OutboxDispatcherService`** (`apps/api/src/infrastructure/outbox-dispatcher.service.ts`) — TEN-16 fix lives in `packages/events/src/outbox/dispatcher.ts`, but the NestJS wrapper here is what callers actually touch. PR 1 must not regress the existing advisory-lock leader election.
- **`identity-core.module.ts`** — TEN-09 audit gap closure + TEN-14 buildEnvelope migration are co-located here; PR 3 must do both in one commit to avoid mid-PR merge conflict (per D-15).

</code_context>

<specifics>
## Specific Ideas

- **Founder framing** (verbatim from questioning): «мультитенантный слой чтобы он был проработан максимально интерпрайзево безопастно». Phase 1 = enterprise-bar tenancy. "Enterprise" here means: GDPR-native, auditable, observable per tenant, multi-replica-ready (modulo the outbox claim-token race deferred to Phase 7), bug-free in the platform layer.
- **From Investor lens:** GDPR-native (TEN-05/06/09) is the one Phase 1 deliverable that shows up in EU sales conversations as a differentiator vs lighter competitors (Choice, Tablein). Plan should treat the erasure scheduler as a sales asset, not just engineering hygiene.
- **From CTO lens:** TEN-08 is the line of defense against cross-tenant leaks at 100+ tenants. Plan must NOT under-budget this — 3-4 days for 4 fixture categories with real Docker stack is realistic; anything shorter is yellow flag.
- **From Skeptic lens:** Watch for TEN-07, TEN-08, TEN-09 being declared "done" prematurely — they have the largest gap between "code compiles" and "actually proves the property." DOR for these reqs must include the actual test/assertion artifact, not just the change to production code.

</specifics>

<deferred>
## Deferred Ideas

### Out of Phase 1 scope (will be addressed elsewhere)

- **`releaseOutboxClaim` claim-token race** (CONCERNS `packages/events/src/outbox/repository.ts:110-128`) — DEFERRED to Phase 7 (Ordering), where it lives as ORD-11. CTO's project-level review flagged this; Phase 7 plan must NOT skip it because Phase 7 is when real financial events flow.
- **`catalog` context audit gap analysis** — DEFERRED to Phase 4 (Catalog Admin) per D-14.
- **`ordering` context audit + envelope migration** — happens organically in Phase 7 when the context is created; no separate audit gap analysis.
- **Per-email rate-limit migration to Redis** (`apps/api/src/shared/security.ts:62-75`, CONCERNS) — DEFERRED until 2-replica horizontal scale event. Plan documents this as a known LOW-priority gap; not a Phase 1 deliverable.
- **Grafana dashboards / alert rules for per-tenant metrics** — DEFERRED to Phase 1.1 or 20+ tenants per D-05. Phase 1 only emits labels.
- **`feature-flags` package scaffolding** (CONCERNS — empty `.gitkeep`) — DEFERRED. Phase 16 ONB-05 (dev-mode skip) implementation will use environment variable instead of feature flag, per the discussion of avoiding silent import failures.
- **Custom `eslint-plugin-resto`** — DEFERRED. `no-restricted-syntax` overrides suffice for TEN-12/15 (D-09). If a third RestOS-specific lint emerges, revisit at that time.
- **Order-status guest emails wiring** — Phase 8 work (folded into GNOTIF-01..04). Phase 1 does not touch Resend adapter.

### Investor-flagged business question (NOT engineering)

- **CAC and sales cycle validation in EU 1-10-location restaurants** — Investor's closing point is that no codebase work answers whether the ICP will pay. This is a founder-side concern outside any phase scope. Note here so it does not get lost: before Phase 8 (Payments) ships, the founder should have qualitative validation from 3-5 target restaurants that the pricing model + onboarding promise resonates. This is sales/discovery work, not GSD work.

### Reviewed Todos (not folded)

None — `todo.match-phase 1` returned zero matches.

</deferred>

---

_Phase: 1-tenancy-hardening_
_Context gathered: 2026-05-25_
