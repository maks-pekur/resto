---
phase: quick-260812-i7v
verified: 2026-08-12T13:45:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Quick Task 260812-i7v: Fix order status persistence on cancel/refund — Verification Report

**Task Goal:** Fix `CancelOrderService`/`RefundOrderService` calling INSERT-only `OrderDrizzleRepository.save()` instead of `update()`, so `orders.status` never flipped to canceled/refunded and the outbox events were silently dropped. Prove the fix with a DB read-back test.

**Verified:** 2026-08-12
**Status:** passed
**Base commit:** `62dac08` · **Task commits:** `32016da` (RED), `642bf8c` (GREEN) · **Merge:** `9665163` (current HEAD, `admin-vite-spa`)

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                           | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Canceling an unpaid (created) order leaves `orders.status = 'canceled'` in the DB, proven by re-reading the row | ✓ VERIFIED | `payment-lifecycle.e2e.spec.ts:462-495` — `readOrderStatus()` issues a real `SELECT` via `stack.db.withoutTenant`; orchestrator confirmed 6/6 passed live.                                                                                                                                                                                                                                                                                                           |
| 2   | Fully refunding a paid order leaves `orders.status = 'refunded'` in the DB                                      | ✓ VERIFIED | `payment-lifecycle.e2e.spec.ts:497-539`, same read-back pattern; also asserts `payments.status === 'refunded'`.                                                                                                                                                                                                                                                                                                                                                      |
| 3   | Canceling a paid order persists the auto-refund status transition instead of leaving the row at `'paid'`        | ✓ VERIFIED | `payment-lifecycle.e2e.spec.ts:541-576` — explicit `expect(status).not.toBe('paid')` guards the exact production symptom.                                                                                                                                                                                                                                                                                                                                            |
| 4   | `ordering.order_canceled.v1` outbox row exists after cancel; `ordering.order_refunded.v1` exists after refund   | ✓ VERIFIED | `readOutboxTypes()` selects real rows from `schema.outboxEvents`; both event types asserted present in the respective cases.                                                                                                                                                                                                                                                                                                                                         |
| 5   | On the refund path, the `orders` UPDATE and both outbox appends (ordering + payments) commit in one transaction | ✓ VERIFIED | Code read of `refund-order.service.ts:60-132` — `tx` from the enclosing `withTenant` is threaded into `this.orderRepo.update(order, tx)` (line 114) and into the `appendToOutbox` call (line 119); `#runUpdate` in `order-drizzle.repository.ts:127-153` performs the UPDATE and the outbox append inside the same `tx` it's given. e2e case at line 497 asserts both `ordering.order_refunded.v1` and `payments.order_refunded.v1` land after one `execute()` call. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact                                                             | Expected                                                                                        | Status     | Details                                                                                                                                      |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/test/e2e/payment-lifecycle.e2e.spec.ts`                    | 3 DB-read-back regression cases, contains `ordering.order_canceled.v1`                          | ✓ VERIFIED | 3 new `it(...)` cases at lines 462, 497, 541; string appears 2×; all use `readOrderStatus`/`readOutboxTypes` real-SELECT helpers, not mocks. |
| `apps/api/src/contexts/payments/application/cancel-order.service.ts` | Cancel persists via `update()`, contains `this.orderRepo.update(order)`                         | ✓ VERIFIED | Line 55, single-line diff from `save(order)`.                                                                                                |
| `apps/api/src/contexts/payments/application/refund-order.service.ts` | Refund persists via `update()` inside enclosing tx, contains `this.orderRepo.update(order, tx)` | ✓ VERIFIED | Line 114, single-line diff from `save(order)`.                                                                                               |

### Key Link Verification

| From                            | To                              | Via                                                            | Status  | Details                                                                                                                             |
| ------------------------------- | ------------------------------- | -------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `refund-order.service.ts`       | `OrderDrizzleRepository.update` | same-tx status write + outbox append                           | ✓ WIRED | `this.orderRepo.update(order, tx)` at line 114, `tx` is the enclosing `withTenant` parameter.                                       |
| `cancel-order.service.ts`       | `OrderDrizzleRepository.update` | own `withTenant` opened by `update()`                          | ✓ WIRED | `this.orderRepo.update(order)` at line 55, no `tx` — matches the plan's decided transaction shape (service holds no tx of its own). |
| `payment-lifecycle.e2e.spec.ts` | orders table read-back          | `withoutTenant` select of `schema.orders.status`               | ✓ WIRED | `readOrderStatus()` helper, lines 125-133.                                                                                          |
| `payment-lifecycle.e2e.spec.ts` | outbox_events table read-back   | select of `schema.outboxEvents.type` filtered by `aggregateId` | ✓ WIRED | `readOutboxTypes()` helper, lines 135-143.                                                                                          |

### Behavioral Spot-Checks

| Behavior                                              | Command                                                                                            | Result                                   | Status                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| Unit specs assert `update`, guard `save` never called | `pnpm exec vitest run cancel-order.service.spec.ts refund-order.service.spec.ts` (from `apps/api`) | 2 files, 15 tests passed (4 + 11)        | ✓ PASS (run live by this verifier)                                    |
| Typecheck clean                                       | `pnpm nx run api:typecheck`                                                                        | exits 0, api + domain/db/events all pass | ✓ PASS (run live by this verifier)                                    |
| e2e read-back suite                                   | `pnpm exec vitest run test/e2e/payment-lifecycle.e2e.spec.ts`                                      | 6/6 passed, 0 skipped                    | ✓ PASS (already run live by orchestrator per task brief — not re-run) |

### Scope Fence

| Check                                                         | Result                                                                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `git diff --name-only 62dac08..HEAD`                          | Exactly 5 files: the 2 production service files, their 2 unit specs, and the 1 e2e spec. No migrations, controllers, or guards appear. |
| `order-drizzle.repository.ts` byte-unchanged                  | ✓ Confirmed — `git diff 62dac08..HEAD -- order-drizzle.repository.ts` is empty.                                                        |
| `order.aggregate.ts` byte-unchanged                           | ✓ Confirmed — `git diff 62dac08..HEAD -- order.aggregate.ts` is empty.                                                                 |
| `wasPaid` predicate at `cancel-order.service.ts:33` unchanged | ✓ Confirmed — `const wasPaid = snap.status === 'paid';`, untouched by the 1-line diff at line 55.                                      |
| No RBAC/permission/guard file touched                         | ✓ Confirmed — `git diff --stat 62dac08..HEAD -- '**/*.guard.ts' '**/*permission*' '**/*rbac*'` produces no output.                     |
| Production diff size                                          | Exactly 1 changed line in each of the two service files (2 total), matching the plan's stated "2-line diff."                           |
| Merge commit introduces no extra changes                      | ✓ Confirmed — `git diff 642bf8c 9665163 --stat` is empty; merge is a clean union of the two task commits.                              |

### No Remaining Wrong Call Sites

`grep -rn 'orderRepo\.save(' apps/api/src --include='*.ts'` (excluding specs) returns zero matches. The only remaining `.save(order` caller in `apps/api/src` is `create-order.service.ts:133`, which calls it on a freshly-constructed `Order.create(...)` aggregate — a legitimate creation path, not a status-mutation path. No orphaned wrong call sites remain.

### Unit Spec Honesty

`git diff 62dac08..HEAD` on both `.spec.ts` files shows every prior `orderRepo.save.mock.calls[...]` / `orderRepo.save.mockClear()` reference swapped to `orderRepo.update`, with a new `expect(orderRepo.save).not.toHaveBeenCalled()` guard added at each assertion site (3 sites in `cancel-order.service.spec.ts`, 3 sites + 1 tx-threading assertion in `refund-order.service.spec.ts`). No assertion was deleted — only swapped and strengthened. Confirmed passing live: 4/4 (cancel) + 11/11 (refund).

### RED Genuineness

Verified structurally (not by re-running the full RED→GREEN cycle, per the plan's explicit allowance):

- `git show --stat 32016da` confirms the RED commit touches only `payment-lifecycle.e2e.spec.ts` (178 insertions, 1 deletion) — no production code.
- `git show 32016da:cancel-order.service.ts` and `git show 32016da:refund-order.service.ts` confirm both files still contained the buggy `this.orderRepo.save(order)` call at that commit — the fix had not landed.
- `git show --stat 642bf8c` confirms the fix commit's only production-file changes are the 2 single-line swaps, isolated from the RED commit.
- SUMMARY.md documents the actual observed RED output (`3 failed | 3 passed (6)`, 0 skipped) with failure messages matching the exact production symptom (`expected 'created' to be 'canceled'`, `expected 'paid' to be 'refunded'`) rather than a fixture error.

This chain (buggy code present at RED commit + test-only diff + documented failure matching the bug) is sufficient evidence the RED state was genuine.

### Outbox Atomicity

Read `order-drizzle.repository.ts:119-153` directly:

- `update(order, tx?)`: if `tx` is passed, calls `#runUpdate(tx, order)` directly (no new transaction); if omitted, opens its own `withTenant` and runs `#runUpdate` inside it.
- `#runUpdate` performs the `UPDATE ... WHERE id AND tenantId` (throwing if zero rows matched) and then loops `appendToOutbox(tx, ...)` for every drained event — all inside the single `tx` it was given.

Refund path (`refund-order.service.ts:60,114`): `this.orderRepo.update(order, tx)` threads the same `tx` from the enclosing `this.db.withTenant(async (tx) => ...)` that also does the `payments`/`refunds` writes and the `payments.order_refunded.v1` outbox append — all four writes commit together.

Cancel path (`cancel-order.service.ts:55`): `this.orderRepo.update(order)` passes no `tx` — the service holds no transaction of its own — so `update()` opens its own `withTenant`, still binding the status UPDATE and the `ordering.order_canceled.v1` append into one commit.

### Anti-Patterns Found

None. Scanned all 5 modified files for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers, placeholder strings, and empty-return stubs — zero matches.

### Requirements Coverage

| Requirement | Source Plan          | Description                                                                                                                                                       | Status      | Evidence                                                            |
| ----------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| C-1         | `260812-i7v-PLAN.md` | Persist order status transitions on cancel/refund (local task-scoped requirement; not present in `.planning/REQUIREMENTS.md`, which is expected for a quick task) | ✓ SATISFIED | All 5 truths above verified against live code + DB read-back tests. |

### Human Verification Required

None. This is a backend persistence fix with DB-level proof (real `SELECT`s against `orders` and `outbox_events`); no UI, visual, or external-service behavior is involved.

### Gaps Summary

No gaps. All must-haves verified against the current working tree (`admin-vite-spa` @ `9665163`), the scope fence held exactly as specified, no wrong call sites remain, unit specs were honestly realigned (not weakened), RED was structurally genuine, and outbox atomicity is confirmed by direct code reading on both the cancel and refund paths.

---

_Verified: 2026-08-12_
_Verifier: Claude (gsd-verifier)_
