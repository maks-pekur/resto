---
phase: 08-payments-stripe-connect
plan: 07
subsystem: payments
tags: [opentelemetry, outbox, stripe, zod, health-check]

requires:
  - phase: 07.5-03
    provides: outbox leader election, advisory-lock heartbeat, /readyz stale-leader drain

provides:
  - outbox.is_leader OTel observable gauge (1 when leader, 0 otherwise)
  - backlog-aware /readyz stale-leader probe that distinguishes idle queue from wedged leader
  - acquisition-time lastDispatchAt seed that closes the never-dispatched-leader false-negative
  - StripeAccountId z.string().max(255) on the account.updated webhook parse path
  - OUTBOX_STALL_THRESHOLD_MS default aligned to 30s (PAY-12 SLA)

affects: [health-monitoring, outbox-dispatcher, stripe-webhook, tenancy-domain]

tech-stack:
  added: []
  patterns:
    - 'Observable gauge via createObservableGauge + addCallback (1/0 leader signal)'
    - 'Backlog-age probe: isNull(deliveredAt) MIN(occurredAt) via withoutTenant system scan'
    - 'Shared Zod schema (StripeAccountId) exported from domain aggregate for cross-layer reuse'

key-files:
  created: []
  modified:
    - apps/api/src/infrastructure/outbox-dispatcher.service.ts
    - apps/api/src/health/health.controller.ts
    - apps/api/src/health/health.controller.spec.ts
    - apps/api/src/config/env.schema.ts
    - apps/api/src/contexts/tenancy/domain/tenant.aggregate.ts
    - apps/api/src/contexts/tenancy/domain/tenant.aggregate.spec.ts
    - apps/api/src/contexts/payments/application/handle-stripe-event.service.ts
    - apps/api/eslint.config.mjs
    - packages/db/src/withoutTenant.allowlist.ts
    - packages/db/test/unit/withoutTenant-allowlist.spec.ts

key-decisions:
  - 'D-14: seed lastDispatchAt at lock acquisition (not just on first dispatch) — avoids backlog query on the happy path; wedged leader grows staleMs from acquisition time'
  - 'Backlog probe only fires when staleMs > threshold — idle queue (null result) → ok, non-empty backlog → 503. Avoids one extra DB query per readyz poll under normal operation'
  - 'StripeAccountId exported from tenant.aggregate.ts — domain layer already owns all Stripe-id fields; co-locating the schema avoids a new file and keeps the bound where the type is defined'
  - 'PAY-11 bound applied at the webhook handler parse step (safeParse on event.account) — Stripe SDK types the field as string|undefined with no length bound; our schema adds the guard at the trust boundary'

requirements-completed: [PAY-11, PAY-12]

duration: 25min
completed: 2026-06-27
---

# Phase 8 Plan 07: Outbox Leader Gauge + False-Negative Fix + StripeAccountId Bound Summary

**`outbox.is_leader` OTel gauge (1/0), backlog-aware /readyz probe closing the never-dispatched false-negative, 30s stall threshold default, and effective `StripeAccountId.max(255)` on the Stripe webhook parse path**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-27T11:00:00Z
- **Completed:** 2026-06-27T11:25:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- `outbox.is_leader` observable gauge registered via `createObservableGauge` + `addCallback`; reports 1 when this instance holds the pg advisory lock, 0 otherwise, labelled `{ 'tenant.id': 'platform' }`.
- `tryAcquireLeadership` now seeds `lastDispatchAt = new Date()` immediately after acquiring the lock — a leader that has never dispatched accumulates staleMs from acquisition time, not from infinity.
- `checkOutboxLeader` upgraded to backlog-aware: when `staleMs > threshold`, queries `MIN(occurred_at)` of undelivered outbox rows; empty queue → ok (idle is healthy), non-empty → 503 with backlog age in detail.
- `getOldestUndeliveredOutboxAgeMs()` added to `OutboxDispatcherService` (uses `withoutTenant` system scan, correctly added to the allowlist).
- `OUTBOX_STALL_THRESHOLD_MS` default lowered from 60 000 ms to 30 000 ms, matching the PAY-12 ">30s" SLA.
- `StripeAccountId = z.string().min(1).max(255)` exported from `tenant.aggregate.ts`; consumed by `handleAccountUpdated` to validate `event.account` before any tenant lookup (PAY-11 T-08-07 mitigated).
- Unit tests: 2 new health spec cases (wedged+backlog → 503; stale+empty → ok) + 2 StripeAccountId spec cases (valid → true; 256-char → false). All 24 affected tests green.

## Task Commits

1. **Task 1: outbox.is_leader gauge + backlog-aware stale check** — `8302494` (feat)
2. **Task 2: StripeAccountId .max(255) on webhook path + 30s threshold** — `67a6396` (feat)

## Files Created/Modified

- `apps/api/src/infrastructure/outbox-dispatcher.service.ts` — added `isLeaderGauge`, `addCallback`, acquisition-time `lastDispatchAt` seed, `getOldestUndeliveredOutboxAgeMs()`, drizzle-orm `isNull`/`min` imports, `schema` import from `@resto/db`
- `apps/api/src/health/health.controller.ts` — `checkOutboxLeader` upgraded to async backlog-aware probe
- `apps/api/src/health/health.controller.spec.ts` — 2 new test cases (wedged+backlog, stale+empty); updated existing stale test to pass non-null backlog
- `apps/api/src/config/env.schema.ts` — `OUTBOX_STALL_THRESHOLD_MS` default 60 000 → 30 000, comment updated
- `apps/api/src/contexts/tenancy/domain/tenant.aggregate.ts` — exported `StripeAccountId = z.string().min(1).max(255)`
- `apps/api/src/contexts/tenancy/domain/tenant.aggregate.spec.ts` — 2 new StripeAccountId test cases
- `apps/api/src/contexts/payments/application/handle-stripe-event.service.ts` — `handleAccountUpdated` now parses `event.account` through `StripeAccountId.safeParse`; rejects oversized/invalid ids with warn log
- `apps/api/eslint.config.mjs` — added `src/infrastructure/outbox-dispatcher.service.ts` to `@withoutTenant-allowlist` block
- `packages/db/src/withoutTenant.allowlist.ts` — added `apps/api/src/infrastructure/outbox-dispatcher.service.ts` (10th entry)
- `packages/db/test/unit/withoutTenant-allowlist.spec.ts` — length sanity check updated 9 → 10

## Decisions Made

- Backlog probe queries inside `getOldestUndeliveredOutboxAgeMs()` on the `OutboxDispatcherService`, not directly in the controller — keeps the DB concern inside the service that already owns the dispatcher context.
- Existing stale test updated to pass `oldestUndeliveredAgeMs = 90_000` (non-null) to match the new semantics: stale + non-empty → 503. The old behavior was a false-negative; the test was wrong, not the spec.
- `StripeAccountId` placed in `tenant.aggregate.ts` (not a new file) — the aggregate is already the single source of truth for all Stripe-related state on the tenant; exporting the schema here keeps the max bound visible to both the domain and the payments context without introducing a new cross-context import path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `outbox-dispatcher.service.ts` to withoutTenant allowlist**

- **Found during:** Task 1 (implementing `getOldestUndeliveredOutboxAgeMs`)
- **Issue:** The new method calls `db.withoutTenant(...)` but the file was not in the `WITHOUT_TENANT_ALLOWLIST` const or the ESLint `@withoutTenant-allowlist` block; the parity test would have failed at CI.
- **Fix:** Added entry to `packages/db/src/withoutTenant.allowlist.ts`, `apps/api/eslint.config.mjs`, and updated the length sanity check in the parity test from 9 to 10.
- **Files modified:** `packages/db/src/withoutTenant.allowlist.ts`, `apps/api/eslint.config.mjs`, `packages/db/test/unit/withoutTenant-allowlist.spec.ts`
- **Committed in:** `8302494` (Task 1 commit)

**2. [Rule 1 - Bug] Updated existing stale test to pass non-null backlog**

- **Found during:** Task 1 GREEN phase
- **Issue:** The pre-existing "returns 503 when leader dispatch is stale" test used `makeOutboxSvc(true, stale)` — which defaulted `oldestUndeliveredAgeMs` to `null` (empty queue) after the mock was updated. The test would have passed as ok (no longer 503), contradicting the test's intent.
- **Fix:** Updated the test to pass `90_000` for `oldestUndeliveredAgeMs` and renamed it to reflect the backlog-present condition.
- **Files modified:** `apps/api/src/health/health.controller.spec.ts`
- **Committed in:** `8302494` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical allowlist registration, 1 pre-existing test bug exposed by new semantics)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered

None — plan executed cleanly once the allowlist registration was handled.

## Known Stubs

None — all changes are wired and effective on the real parse/probe paths.

## Threat Flags

None — all changes implement mitigations already declared in the plan's threat model (T-08-06 → D-14 gauge + probe; T-08-07 → PAY-11 StripeAccountId bound).

## Next Phase Readiness

- PAY-12 fully closed: gauge observable in OTel dashboards, false-negative eliminated, stall threshold aligned to 30s SLA.
- PAY-11 bound effective on the `account.updated` webhook parse path, proven by a rejecting unit test.
- No blockers for downstream plans.

---

_Phase: 08-payments-stripe-connect_
_Completed: 2026-06-27_
