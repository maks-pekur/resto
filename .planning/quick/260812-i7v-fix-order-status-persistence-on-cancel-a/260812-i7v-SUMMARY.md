---
phase: quick-260812-i7v
plan: 01
subsystem: payments
tags: [drizzle, postgres, outbox, orders, refunds, vitest, tdd]

requires:
  - phase: 08-payments-stripe-connect
    provides: RefundOrderService, CancelOrderService, OrderDrizzleRepository.update()
provides:
  - 'CancelOrderService and RefundOrderService now persist order status transitions via OrderDrizzleRepository.update() instead of the INSERT-only save()'
  - '3 new e2e regression cases proving orders.status and outbox rows are readable from Postgres after cancel/refund'
  - 'Anti-regression unit-spec guards (orderRepo.save never called) on both services'
affects: [phase-10-admin-order-intake]

tech-stack:
  added: []
  patterns:
    - 'Repository call-site correction: use update() (UPDATE + same-tx outbox append) for existing aggregates, save() only for brand-new inserts'

key-files:
  created: []
  modified:
    - apps/api/test/e2e/payment-lifecycle.e2e.spec.ts
    - apps/api/src/contexts/payments/application/cancel-order.service.ts
    - apps/api/src/contexts/payments/application/refund-order.service.ts
    - apps/api/src/contexts/payments/application/cancel-order.service.spec.ts
    - apps/api/src/contexts/payments/application/refund-order.service.spec.ts

key-decisions:
  - 'RefundOrderService threads the enclosing withTenant tx into update(order, tx) — keeps orders UPDATE + refunds/payments writes + both outbox appends in one commit, and removes the prior accidental nested withTenant'
  - 'CancelOrderService calls update(order) with no tx — the service holds no transaction, so update() opens its own withTenant, still binding the status write and the outbox append together'
  - "Current cancel-of-paid-order semantics (auto-refund branch lands on 'refunded', not 'canceled') encoded as-is in tests — that asymmetry is explicitly Phase 10's D-08/D-09 problem, not this task's"

requirements-completed: [C-1]

duration: ~20min
completed: 2026-08-12
---

# Quick Task 260812-i7v: Fix order status persistence on cancel/refund Summary

**`CancelOrderService`/`RefundOrderService` were calling the INSERT-only `OrderDrizzleRepository.save()` on already-existing orders — the insert silently no-opped on conflict, so `orders.status` never updated and the already-drained cancel/refund domain events were discarded. Fixed by switching both call sites to `update()`, proven by 3 new e2e cases that read `orders.status` and `outbox_events.type` back from Postgres.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-12T11:03:00Z (approx.)
- **Completed:** 2026-08-12T11:23:26Z
- **Tasks:** 2 (RED + GREEN)
- **Files modified:** 5

## Accomplishments

- Canceling an unpaid order now persists `status = 'canceled'` and emits `ordering.order_canceled.v1` to the outbox in the same commit.
- Fully refunding a paid order now persists `status = 'refunded'`, and both `ordering.order_refunded.v1` and `payments.order_refunded.v1` land in the same transaction as the orders UPDATE.
- Canceling a paid order (auto-refund branch) now persists the `refunded` transition instead of silently leaving the row at `paid` — the exact production symptom this task closes.
- Both payments unit specs realigned onto `update()` with new `orderRepo.save` never-called guards, so a future regression back to `save()` fails at the unit level too.

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — e2e cases that read orders.status and the outbox back from Postgres** - `32016da` (test)
2. **Task 2: GREEN — swap both call sites to update() and realign the unit specs** - `642bf8c` (fix)

_TDD plan: RED (Task 1) then GREEN (Task 2), no refactor step needed — the fix was already the minimal correct call._

## Files Created/Modified

- `apps/api/test/e2e/payment-lifecycle.e2e.spec.ts` - Hoisted `locationId` to suite scope; added `seedOrder`/`seedPayment`/`readOrderStatus`/`readOutboxTypes` helpers; added 3 new DB-read-back regression cases for operator cancel (unpaid), operator refund (paid, full), and operator cancel (paid, auto-refund)
- `apps/api/src/contexts/payments/application/cancel-order.service.ts` - `this.orderRepo.save(order)` → `this.orderRepo.update(order)` (1 line)
- `apps/api/src/contexts/payments/application/refund-order.service.ts` - `this.orderRepo.save(order)` → `this.orderRepo.update(order, tx)` (1 line, threads the enclosing `withTenant` tx)
- `apps/api/src/contexts/payments/application/cancel-order.service.spec.ts` - Assertions realigned from `orderRepo.save.mock.calls` to `orderRepo.update.mock.calls`; added `expect(orderRepo.save).not.toHaveBeenCalled()` guard in all 3 assertion-bearing cases
- `apps/api/src/contexts/payments/application/refund-order.service.spec.ts` - Same realignment across 3 assertion sites + 1 `mockClear()`; added `orderRepo.update` tx-threading assertion + `save` never-called guard to the 3 realigned cases

## Decisions Made

- `RefundOrderService.executeWithOrder` threads the enclosing `tx` into `update(order, tx)` per the plan's pre-decided transaction shape — this also removes the prior accidental nested `withTenant` (the old `save()` call opened a second transaction from inside the first).
- `CancelOrderService.execute` calls `update(order)` with no `tx` (the service holds no transaction of its own); `update()`'s own `withTenant` still binds the status write and the outbox append into one commit.
- No changes to `OrderDrizzleRepository`, `Order.cancel()`/`Order.refund()` guards, the `wasPaid` predicate, RBAC, or any migration — held the scope fence exactly as specified. `git diff --stat` on the two production files confirms 1 changed line each (2 total).

## Deviations from Plan

None - plan executed exactly as written. The plan estimated "refund 10/10" unit tests in its `<done>` criteria; the actual pre-existing spec file has 11 cases (all green) — this is a minor estimate discrepancy in the plan text, not a deviation in implementation.

## Issues Encountered

- `node_modules` was absent in this freshly-reset worktree (`vitest` binary not found via `pnpm --filter @resto/api exec vitest`). Ran `pnpm install` (12s, lockfile-satisfied, no resolution changes) before any test command — this is workspace bootstrap, not a plan deviation.

## RED State Evidence (Task 1)

Command: `pnpm --filter @resto/api exec vitest run test/e2e/payment-lifecycle.e2e.spec.ts`

Result: **3 failed | 3 passed (6)**, 0 skipped (Docker was up throughout — no `describe.skip`).

Failure messages (production symptom, not fixture errors):

```
expected 'created' to be 'canceled' // Object.is equality   (operator cancel of unpaid order)
expected 'paid' to be 'refunded' // Object.is equality       (operator full refund of paid order)
expected 'paid' to be 'refunded' // Object.is equality       (operator cancel of paid order — auto-refund)
```

The 3 pre-existing steps (checkout, payment_intent.succeeded, charge.refunded) stayed green throughout.

## GREEN State Evidence (Task 2)

- `payment-lifecycle.e2e.spec.ts`: **6/6 passed**, 0 skipped.
- `cancel-order.service.spec.ts`: **4/4 passed**.
- `refund-order.service.spec.ts`: **11/11 passed**.
- `pnpm nx run api:typecheck`: exits 0 (api + domain/db/events dependency graph).
- `grep -rn 'orderRepo\.save(' apps/api/src/contexts/payments/application/` (excluding spec files): no matches.
- `git diff --stat` on the two production files: 1 line changed each (2 total).
- `git diff --name-only`: exactly the 4 files in the plan's file-list — `order-drizzle.repository.ts`, `order.aggregate.ts`, any migration, controller, or guard untouched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 10 (Admin Order Intake) can now build on correct cancel/refund status persistence — the pre-requisite quick task noted in `10-CONTEXT.md` is resolved. The known asymmetry (cancel of a paid order lands on `refunded` via the auto-refund branch, never on `canceled`) is intentionally left in place for Phase 10's D-08/D-09 to address; it is now at least _persisted_ correctly rather than silently lost.

---

_Quick task: 260812-i7v_
_Completed: 2026-08-12_

## Self-Check: PASSED

All 5 modified files found on disk; both commits (`32016da`, `642bf8c`) found in `git log`.
