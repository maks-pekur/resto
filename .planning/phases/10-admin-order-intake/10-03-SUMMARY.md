---
phase: 10-admin-order-intake
plan: 03
subsystem: api

tags:
  [ordering, domain-aggregate, event-contracts, state-machine, refunds, drizzle]

# Dependency graph
requires:
  - phase: 10-admin-order-intake plan 01
    provides: orders table's 15 new intake columns (short_number, channel, per-state timestamps, cancel actor/reason/note, canceled_from_status, eta_at, marketing consent) and orders_cancel_reason_chk / orders_canceled_from_status_chk CHECK constraints
  - phase: 10-admin-order-intake plan 02
    provides: order:cancel RBAC permission verb (not consumed directly by this plan, but the sibling wave-1 dependency)
provides:
  - Order aggregate whose only terminal-status writer is cancel(); legal from created/paid/accepted/preparing/ready, always lands on 'canceled' with canceledFromStatus recorded
  - refund() with zero order-status gate; discretionary refunds never overwrite fulfillment status (T-10-03-01 closed)
  - Every ordering.* v1 event payload carrying locationId; OrderPaidV1 carrying real captured total/currency instead of hardcoded total:0/currency:'USD'
  - OrderCanceledV1/OrderStatusChangedV1 carrying actorUserId; OrderCanceledV1 carrying reasonCode + canceledFromStatus
  - order-drizzle.repository.ts round-tripping all 15 plan-10-01 columns through save/update/read
  - InvalidCancelReasonError validating the canonical seven cancel-reason codes at the domain layer, ahead of the DB CHECK constraint
affects:
  [
    10-04 (short-number generator + CreateOrderService wiring consumes the widened CreateOrderInput),
    10-05 (rewrites CancelOrderService's wasPaid predicate + currentStatus gate + adds real reason-code/actor UI wiring on top of this plan's minimal call-site adaptation),
    admin order-mutation controller/services still to be built,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Domain aggregate extension: widen a transition's status guard, add per-transition timestamp/actor stamping in the same snapshot spread, thread new event fields at every #events.push call site"
    - 'Additive-within-v1 event contract change: add new REQUIRED payload fields to existing Zod schemas rather than bumping to v2, since producer+consumer ship in the same deploy'

key-files:
  created: []
  modified:
    - apps/api/src/contexts/ordering/domain/events.ts
    - packages/events/src/contracts/ordering.ts
    - apps/api/src/contexts/ordering/domain/order.aggregate.ts
    - apps/api/src/contexts/ordering/domain/errors.ts
    - apps/api/src/contexts/ordering/domain/order.aggregate.spec.ts
    - apps/api/src/contexts/ordering/infrastructure/order-drizzle.repository.ts
    - apps/api/test/e2e/payment-lifecycle.e2e.spec.ts
    - apps/api/src/contexts/payments/application/cancel-order.service.ts
    - apps/api/src/contexts/payments/application/refund-order.service.ts
    - apps/api/src/contexts/notifications/infrastructure/nats-guest-notification.subscriber.spec.ts
    - apps/api/src/contexts/ordering/interfaces/http/orders.controller.spec.ts
    - apps/api/src/contexts/payments/application/cancel-order.service.spec.ts
    - apps/api/src/contexts/payments/application/refund-order.service.spec.ts
    - apps/api/src/contexts/payments/application/create-checkout-payment.service.spec.ts
    - apps/api/src/contexts/payments/application/handle-stripe-event.service.spec.ts

key-decisions:
  - "cancel() takes (reasonCode, cancelNote, actorUserId, now) as explicit params, not the 08.3 Better-Auth WeakMap actor-stash pattern -- that stash exists only for BA's uninterceptable plugin hooks, a constraint that doesn't apply to first-party aggregate methods (per plan directive)"
  - 'refund() keeps its snapshot spread (bumps updatedAt) but never assigns status -- money-completeness now lives exclusively on payments.status/payment_refunds'
  - "CancelOrderService/RefundOrderService adapted with the MINIMUM change needed to compile and behave correctly against the new aggregate signature (hardcoded reasonCode 'other', actorUserId null, fixed the fullyRefunded derivation bug) -- the wasPaid predicate and currentStatus gate are left byte-identical per the plan's explicit deferral to 10-05's full rewrite"
  - "'refunded' OrderStatus is no longer reachable through any aggregate method's public API (refund() never writes status); order.aggregate.spec.ts constructs it via fromSnapshot() to prove cancel() still guards against acting on a terminal order"

requirements-completed: [ORDINT-03, ORDINT-04, ORDINT-05, ORDINT-06, ORDINT-07]

# Metrics
duration: ~70min
completed: 2026-08-14
---

# Phase 10 Plan 03: Ordering Domain Layer Rebuild Summary

**Order aggregate's state machine widened so `cancel()` is legal from every pre-completion status and is the sole terminal-status writer; `refund()` stripped of its order-status-rewriting bug; every `ordering.*` v1 event now carries `locationId`, and `OrderPaidV1` carries the real captured total/currency instead of a hardcoded `0`/`'USD'`.**

## Performance

- **Duration:** ~70 min (includes an environment-setup detour — see Issues Encountered)
- **Completed:** 2026-08-14
- **Tasks:** 3 completed
- **Files modified:** 15

## Accomplishments

- `Order.cancel()` widened from `{'created','paid'}` to `{'created','paid','accepted','preparing','ready'}`, always lands on `'canceled'`, records `canceledFromStatus` (the sole discriminator between reject-intent and cancel-intent per D-09), validates the reason code against the canonical seven before any persistence (`InvalidCancelReasonError`), and stamps `canceledAt`/`canceledByUserId`/`cancelReason`/`cancelNote`.
- `Order.refund()`'s live status-rewriting bug (T-10-03-01) is closed: the `isFullRefund ? 'refunded' : 'paid'` line is deleted entirely; a partial refund on a `preparing` order now correctly leaves it `preparing`, and a full discretionary refund on a `completed` order leaves it `completed`.
- `accept()`/`startPreparing()`/`markReady()`/`complete()` thread an explicit `actorUserId` parameter and stamp exactly their own timestamp column (`acceptedAt`/`preparingAt`/`readyAt`/`completedAt`); `accept()` additionally stores the operator-supplied `etaAt` verbatim.
- All five `ordering.*` v1 event contracts (`packages/events/src/contracts/ordering.ts`) and domain event interfaces gained `locationId`; `OrderStatusChangedV1`/`OrderCanceledV1` gained `actorUserId`; `OrderCanceledV1` gained `reasonCode`/`canceledFromStatus` — no guest PII added to any payload (T-07-PII bar maintained).
- `order-drizzle.repository.ts` now round-trips all 15 of plan 10-01's new `orders` columns through `save()`/`update()`/the row→snapshot mapping, and `domainEventToEnvelope()` no longer hardcodes `total: 0, currency: 'USD'` for `OrderPaidV1` or `currency: 'USD'` for `OrderRefundedV1`.
- `payment-lifecycle.e2e.spec.ts`'s `'operator cancel of a paid order...'` case now asserts `.toBe('canceled')` (was `.toBe('refunded')`, the deliberately-narrow interim behavior from quick task `260812-i7v`/commit `32016da`) — proven via a real database read-back, not a mock.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend the ordering domain events and their v1 wire contracts** - `a7e448f` (feat)
2. **Task 2: Widen and correct the Order state machine** - `ad70123` (feat)
3. **Task 3: Persist and read the new columns, and fix the event envelope hardcodes** - `8617d91` (feat)
4. **Follow-up: reword a WHY-comment that false-triggered its own acceptance grep** - `296be65` (docs)

## Files Created/Modified

- `apps/api/src/contexts/ordering/domain/events.ts` - `locationId` on all 5 domain event interfaces; `total`/`currency` on `OrderPaidDomainEvent`; `currency` on `OrderRefundedDomainEvent`; `actorUserId` on `OrderStatusChangedDomainEvent`/`OrderCanceledDomainEvent`; `reasonCode`/`canceledFromStatus` on `OrderCanceledDomainEvent`
- `packages/events/src/contracts/ordering.ts` - matching `locationId`/`actorUserId`/`reasonCode`/`canceledFromStatus` additions to the v1 Zod payload schemas
- `apps/api/src/contexts/ordering/domain/order.aggregate.ts` - widened `cancel()`, defanged `refund()`, actor+timestamp threading on every forward transition, `OrderSnapshot`/`CreateOrderInput` extended with all 10-01 columns
- `apps/api/src/contexts/ordering/domain/errors.ts` - new `InvalidCancelReasonError`
- `apps/api/src/contexts/ordering/domain/order.aggregate.spec.ts` - full rewrite of the transition-signature call sites plus new coverage for every state-machine acceptance criterion in the plan
- `apps/api/src/contexts/ordering/infrastructure/order-drizzle.repository.ts` - `save()`/`update()`/row-mapping extended for 15 new columns; `domainEventToEnvelope()` hardcodes fixed
- `apps/api/test/e2e/payment-lifecycle.e2e.spec.ts` - the mandated `'canceled'` assertion fix plus one additional stale assertion fix on a sibling test (see Deviations)
- `apps/api/src/contexts/payments/application/cancel-order.service.ts` - minimal call-site adaptation to the new `cancel()` signature (Rule 3)
- `apps/api/src/contexts/payments/application/refund-order.service.ts` - `fullyRefunded` derivation fixed to no longer depend on `order.toSnapshot().status` (Rule 1)
- 6 spec files (`nats-guest-notification.subscriber.spec.ts`, `orders.controller.spec.ts`, `cancel-order.service.spec.ts`, `refund-order.service.spec.ts`, `create-checkout-payment.service.spec.ts`, `handle-stripe-event.service.spec.ts`) - `OrderSnapshot`/event-payload object literals updated for the new required fields; 3 stale assertions corrected (Rule 1/3)

## Decisions Made

- `cancel()`/`accept()`/`startPreparing()`/`markReady()`/`complete()` take actor/timestamp params explicitly rather than via the 08.3 WeakMap actor-stash pattern (per plan directive — that pattern exists only for Better Auth's uninterceptable hooks).
- `refund()` keeps bumping `updatedAt` on its snapshot spread but writes no other field — the plan's instruction was "stop assigning status," not "stop touching the snapshot at all."
- `CancelOrderService`/`RefundOrderService` (explicitly out of this plan's file list, owned by plan 10-05) were adapted with the **minimum** change needed to keep the repo compiling and behaviorally correct: `cancel-order.service.ts` now calls `order.cancel('other', cancelReason, null)` (hardcoded `reasonCode: 'other'`, no actor threading yet); `refund-order.service.ts`'s `fullyRefunded` flag is now derived from the payment ledger amounts, not `order.toSnapshot().status`. The `wasPaid` predicate and `currentStatus === 'paid' || 'created'` gate in `CancelOrderService` are left byte-identical, per the plan's explicit note that 10-05 owns their rewrite.
- `'refunded'` is no longer reachable through any aggregate method's public API. `order.aggregate.spec.ts` constructs it via `Order.fromSnapshot()` to prove `cancel()` still guards against acting on a terminal-refunded order (defense-in-depth for a status that could still exist on old rows or a future write path).

## Deviations from Plan

### Auto-fixed Issues

**1. [Environment setup blocker] Worktree spawned from a stale base commit missing all of Wave 1**

- **Found during:** Task 1, immediately after the first commit attempt
- **Issue:** The worktree's `worktree-agent-*` branch HEAD was at commit `b06ffeb` ("Merge pull request #246 from maks-pekur/admin-vite-spa"), which does **not** contain plans 10-01/10-02's commits, nor Phase 08.4/08.5's location-scoping work — despite the `<worktree_branch_check>` step's `git merge-base HEAD <expected-base>` equality check technically passing (the expected base `c39f5361` was an ancestor of `b06ffeb`, just via a much older, unrelated lineage, not because Wave 1 was actually merged onto this branch tip). Concretely: `packages/db/migrations/` only went up to `0057` instead of `0074`, and `Order.aggregate.ts`'s `OrderSnapshot`/`CreateOrderInput` had no `locationId` field at all — contradicting the plan's own "verified" interfaces table.
- **Fix:** Backed up the two Task-1-edited files, ran `git reset --hard c39f5361c1d7b385a38febf02197f07c3f604bc6` (the exact commit the orchestrator specified, confirmed to correctly contain Wave 1 by checking the local `admin-vite-spa` branch, which pointed at that same commit) — this is the reset mechanism the `<worktree_branch_check>` step itself explicitly authorizes ("Only after Step 1 passes is `git reset --hard` safe"), executed here as a startup-time correction before any commits existed. Reapplied the two backed-up files (byte-identical, since Wave 1/2 never touched them) and continued.
- **Files affected:** none beyond confirming the reset restored the correct schema/aggregate state; no code was lost.
- **Verification:** Post-reset `ls packages/db/migrations/*.sql | tail -5` showed `0070`–`0074`; `grep locationId packages/db/src/schema/ordering.ts` and `order.aggregate.ts` confirmed Wave 1's location work was present.

**2. [Rule 1/3 — bug + blocking] Ripple-effect breakage in files outside this plan's stated file list**

- **Found during:** Task 2/3, after widening `OrderSnapshot` (12 new required fields) and `Order.cancel()`'s signature (1→4 params)
- **Issue:** `pnpm --filter api exec tsc --noEmit` surfaced compile errors in `cancel-order.service.ts` (calling `cancel()` with 1 argument against the new 4-param signature) and 6 spec files whose `OrderSnapshot`/event-payload object literals were now missing required properties. Separately, `refund-order.service.ts`'s `fullyRefunded = order.toSnapshot().status === 'refunded'` became permanently `false` (a silent correctness bug) now that `refund()` never writes that status. None of these files are in plan 10-03's `files_modified` list, and the plan explicitly says "Do not touch `CancelOrderService` in this plan" — but the plan's own `<verification>` section requires `tsc --noEmit` clean, which is impossible without adapting these call sites.
- **Fix:** Minimal, non-scope-creeping adaptations only: added the missing `OrderSnapshot` fields (all `null`/defaults) to 6 spec-file object literals; changed `cancel-order.service.ts`'s call to `order.cancel('other', cancelReason, null)` (hardcoded canonical reason code, no real reason-code UI yet — that's 10-05's job) while leaving its `wasPaid`/`currentStatus` gate logic byte-identical; fixed `refund-order.service.ts`'s `fullyRefunded` to derive from `newRefundedMinor >= capturedMinor` instead of order status; updated 3 test assertions that encoded the removed refund-writes-status / cancel-throws-on-non-paid behaviors, each with a WHY-comment.
- **Files modified:** listed in Files Created/Modified above (the 6 spec files + `cancel-order.service.ts` + `refund-order.service.ts`)
- **Verification:** `pnpm --filter api exec tsc --noEmit` clean; full `pnpm nx run api:test -- test/unit src` green (95 files / 763 tests, 0 failures).
- **Committed in:** `ad70123` (Task 2) and `8617d91` (Task 3), split by which task's change caused the ripple.

**3. [Rule 1 — bug] A second pre-existing e2e assertion (not the one named in the plan) also encoded the removed refund-writes-status behavior**

- **Found during:** Task 3, running `payment-lifecycle.e2e.spec.ts`
- **Issue:** `'operator full refund of a paid order persists status=refunded...'` asserted `readOrderStatus(...) === 'refunded'` after a direct `RefundOrderService.execute()` call — the plan only named the sibling `'operator cancel of a paid order...'` case for correction, but this test encodes the identical stale assumption.
- **Fix:** Renamed to `'...leaves order status paid...'`, assertion changed to `.toBe('paid')`, with a WHY-comment citing T-10-03-01.
- **Files modified:** `apps/api/test/e2e/payment-lifecycle.e2e.spec.ts`
- **Verification:** `pnpm --filter api exec vitest run test/e2e/payment-lifecycle.e2e.spec.ts` — 6/6 green, real Postgres read-back.
- **Committed in:** `8617d91` (Task 3)

**4. [Minor — self-correction] WHY-comment literally echoed the old hardcoded strings**

- **Found during:** post-commit acceptance-criteria grep sweep
- **Issue:** A comment explaining the `OrderPaidV1` fix read `// ... total: 0 / currency: 'USD' hardcode`, which matched the plan's own `grep -c "'USD'"` / `grep -n "total: 0"` acceptance checks as a false positive.
- **Fix:** Reworded to describe the old behavior without echoing the literal strings.
- **Files modified:** `apps/api/src/contexts/ordering/infrastructure/order-drizzle.repository.ts`
- **Verification:** re-ran both greps, now 0 matches.
- **Committed in:** `296be65`

---

**Total deviations:** 4 (1 environment-setup blocker, 2 Rule 1/3 auto-fixes, 1 minor self-correction)
**Impact on plan:** All auto-fixes were necessary to keep the repository compiling and its existing test suite green after this plan's (in-scope) contract-widening changes; none expand the plan's functional scope. `CancelOrderService`'s real reason-code/actor-threading rewrite remains fully deferred to plan 10-05, as instructed.

## Issues Encountered

- The worktree environment-setup detour (Deviation 1) consumed a meaningful share of this plan's wall-clock time — see that entry for full detail. No code was lost; the fix was a `git reset --hard` to the correct, orchestrator-specified base commit, done before any commits existed in this session.
- `packages/events/src/contracts/ordering.ts`'s `OrderRefundedV1Payload` already declared `currency` at read time — the plan's Task 1 description said this field was "currently absent," but it was already present (likely from an earlier hardening pass). No action was needed for that specific line; verified via direct read rather than assumed.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The ordering domain layer (aggregate + events + repository) is now the correct foundation for plan 10-04 (short-number generator + `CreateOrderService` wiring, migration 0075 tightening `short_number` to `NOT NULL`) and plan 10-05 (the real `CancelOrderService`/`RefundOrderService` rewrite: D-11's tx restructuring, real reason-code/actor UI wiring, replacing this plan's minimal `'other'`/`null` placeholders).
- `packages/events/src/contracts/ordering.ts` and `apps/api/src/contexts/ordering/domain/events.ts` are stable v1 contracts — no `v2` was introduced; every producer (`order-drizzle.repository.ts`) and consumer (`nats-guest-notification.subscriber.ts`, the audit subscriber) agree on the new required fields.
- No blockers for 10-04/10-05.

## Self-Check: PASSED

All modified files verified present on disk; all 4 commit hashes (`a7e448f`, `ad70123`, `8617d91`, `296be65`) verified in `git log --oneline --all`.

---

_Plan: 10-admin-order-intake/03_
_Completed: 2026-08-14_
