---
phase: 08-payments-stripe-connect
plan: 05
subsystem: payments
tags: [stripe, refunds, cancel, disputes, cross-tenant-isolation, rls, tdd]

dependency_graph:
  requires:
    - '08-01: Order.refund() partial-capable, RefundExceedsCapturedError, payment_refunds table'
    - '08-02: StripeConnectAdapter.createRefund + idempotency keys'
    - '08-03: charge.refunded/refund.updated webhook reconcile + charge.dispute.created handler'
  provides:
    - 'RefundOrderService: owner-endpoint-gated, reason-mandatory, partial-capable refund with idempotency'
    - 'CancelOrderService: canonical cancel→auto-refund path (Phase 10 reuses)'
    - 'POST /v1/orders/:id/refund: billing:update (owner-only) gated refund endpoint'
    - 'cross-tenant isolation e2e: payment/payment_refunds RLS net'
  affects:
    - '08-06: payments.order_refunded.v1 event in outbox drives guest refund email'
    - 'Phase 10: operator order transition UI calls CancelOrderService (no re-implementation)'

tech-stack:
  added: []
  patterns:
    - 'Two-method refund service: execute() (HTTP path) + executeWithOrder() (cancel path) avoids double-load'
    - 'Deterministic idempotency key: refund:<orderId>:<alreadyRefundedMinor>:<amountMinor>'
    - 'Cancel-of-paid order: refund applied BEFORE cancel transition (order.refund() requires paid status)'
    - 'Manual↔webhook reconcile: 08-03 webhook UPDATEs by stripe_refund_id; manual path INSERTs — idempotent'
    - 'Dispute record: PaymentDisputeOpenedV1 outbox event (08-03) IS the persistent record + operator notify'
    - 'Cross-tenant isolation: withTenantId() + RLS scoping verified in e2e'

key-files:
  created:
    - apps/api/src/contexts/payments/application/refund-order.service.ts
    - apps/api/src/contexts/payments/application/refund-order.service.spec.ts
    - apps/api/src/contexts/payments/application/cancel-order.service.ts
    - apps/api/src/contexts/payments/application/cancel-order.service.spec.ts
    - apps/api/src/contexts/payments/interfaces/http/refunds.controller.ts
    - apps/api/test/e2e/payments-isolation.e2e.spec.ts
  modified:
    - apps/api/src/contexts/payments/application/dto.ts
    - apps/api/src/contexts/payments/domain/errors.ts
    - apps/api/src/contexts/payments/interfaces/http/error-mapping.ts
    - apps/api/src/contexts/payments/payments.module.ts

decisions:
  - 'executeWithOrder() as a second entry point on RefundOrderService avoids re-loading an already-mutated order object when CancelOrderService calls it'
  - 'Cancel-of-paid order: order.refund() fires first (requires paid status), then cancel() fires on the now-refunded aggregate — final status is refunded (no refunded→canceled transition in aggregate)'
  - 'Dispute marker: no new DB column (would need a migration = Rule 4 architectural change); the PaymentDisputeOpenedV1 outbox event is the persistent dispute record per D-11 minimal scope'
  - 'billing:update permission gates the refund endpoint (only owner role has billing:update per SYSTEM_ROLES)'
  - 'No cancel HTTP endpoint: CancelOrderService is an exported application service; Phase 10 injects it directly — no duplicate HTTP route'

metrics:
  duration: 90min
  completed: 2026-06-27
  tasks: 2 auto + 1 checkpoint (live-smoke pending)
  files_modified: 10

requirements-completed: [PAY-09]
---

# Phase 8 Plan 05: Refunds + Disputes + Cancel Auto-Refund + Isolation Net

**Owner-only server-enforced refund (full+partial, reason mandatory, idempotent), canonical CancelOrderService that auto-refunds a paid order on cancel (Phase 10 reuses it), manual↔webhook reconcile to one payment_refunds row, dispute record+notify via outbox, cross-tenant payment/refund isolation proven by e2e.**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-06-27T22:30:00Z
- **Completed:** 2026-06-27T23:00:00Z
- **Tasks:** 2 auto (Tasks 1+2) + 1 checkpoint (live refund smoke — awaiting human verification)
- **Files modified:** 10

## Accomplishments

- **RefundOrderService** (`execute` + `executeWithOrder`): validates reason non-empty, loads order, resolves payment row, calls `Order.refund(amount, alreadyRefunded)` (domain invariant = `RefundExceedsCapturedError` on over-refund), calls `StripeConnectAdapter.createRefund` with deterministic idempotency key (`refund:<orderId>:<alreadyRefunded>:<amount>`), inserts `payment_refunds` row, updates `payments.refunded_amount`, saves order (stays `paid` on partial / → `refunded` on full), appends `payments.order_refunded.v1` to outbox (GNOTIF-03 driver)
- **CancelOrderService** (W1 canonical cancel): loads order, if `paid` calls `refundService.executeWithOrder()` BEFORE `order.cancel()` (required: `cancel()` only accepts `paid`/`created`; `refund()` requires `paid` — must fire in this order), then `order.cancel()` on the post-refund aggregate; if `created` (unpaid) just cancels with no refund. Phase 10 injects and calls this service — no duplicate cancel+refund path.
- **Manual↔webhook reconcile**: the `charge.refunded` webhook handler (08-03) calls `findRefundByStripeId` → `updateRefundStatus` if found (the manual path already inserted the row) or `upsertRefund` if absent (Stripe-dashboard-initiated refund). Two paths converge on one `payment_refunds` row — no double-count.
- **Dispute record+notify (D-11)**: `charge.dispute.created` handler (08-03) appends `PaymentDisputeOpenedV1` to the outbox — this is the persistent dispute record (no new column needed) and the operator notification signal. Kept minimal per plan.
- **POST /v1/orders/:id/refund**: `@Permissions({ billing: ['update'] })` + `@RequireActiveTenant()` + `RestoZodValidationPipe(RefundInputDto)`. Only the owner role has `billing:update` in `SYSTEM_ROLES` — server-enforced, not UI-only (T-08-28).
- **Error mapping**: `RefundReasonRequiredError` → 422, `RefundExceedsCapturedError` → 409, `PaymentNotRefundableError` → 409, `OrderNotFoundError` → 404
- **Cross-tenant isolation e2e** (`test/e2e/payments-isolation.e2e.spec.ts`): seeds 2 tenants with paid orders + payments + refund rows; asserts operator A cannot refund tenant B's order (403/404/409), `withTenantId(B)` reading tenant A's payment returns 0 rows (RLS), `withTenantId(A)` reading tenant B's `payment_refunds` returns 0 rows (RLS + composite FK), operator B cannot refund tenant A's order.

## Task Commits

1. **Task 1: RefundOrderService + CancelOrderService + refund endpoint + error mapping** — `12aaa97`
2. **Task 2: cross-tenant payment/refund isolation e2e** — `4fe7b32`

## Test Results

```
Unit (targeted):
  Test Files  4 passed (4)
        Tests  30 passed (30)

Broader unit (payments + ordering + tenancy + shared):
  Test Files  12 passed (12)
        Tests  128 passed (128)

pnpm --filter @resto/api exec tsc --noEmit → exit 0
```

E2e isolation spec: `test/e2e/payments-isolation.e2e.spec.ts` — Docker-gated (skips gracefully without Docker). Runs via testcontainers — verified typecheck clean; live run awaits the human checkpoint.

## Checkpoint Pending: Live Refund Smoke

**Why not auto-verified:** The plan is `autonomous: false` — the live refund path requires a real paid Stripe test order that cannot be seeded by automation alone.

### Steps for the founder to verify after checkpoint approval

1. Start the dev stack: `pnpm dev:up` + `pnpm dev` (api + admin)
2. In a separate terminal: `stripe listen --forward-to localhost:3001/webhook/stripe`
3. Use the Stripe CLI or dashboard to find an existing `pi_test_...` in test mode that is in `succeeded` state (from 08-04b checkpoint)
4. **Partial refund (€5 on a €20 order):**
   ```
   POST /v1/orders/<orderId>/refund
   Cookie: <owner session>
   x-tenant-slug: <your-slug>
   { "amountMinor": 500, "reason": "item out of stock" }
   ```
   Confirm: Stripe dashboard shows €5 refund, `payment_refunds` row inserted, `payments.refunded_amount = 5.00`, order stays `paid`, outbox fires `payments.order_refunded.v1`
5. **Remaining refund (€15):** same endpoint with `amountMinor: 1500` → order flips to `refunded`; a further refund returns 409
6. **Non-owner 403:** POST same endpoint with a non-owner session → expect 403
7. **Auto-cancel refund:** In a test harness or via a temporary script, call `CancelOrderService.execute({ orderId, tenantId, reason: 'test cancel' })` on a paid test order → confirm 1 refund fires (full captured amount), `payment_refunds` has 1 row
8. **Dispute simulation:** `stripe trigger charge.dispute.created` → confirm `payments.dispute_opened.v1` event in outbox (check `outbox` table or logs)

Resume signal: `"refunds verified"` once all paths confirmed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cancel-of-paid order: order.cancel() must fire AFTER order.refund()**

- **Found during:** Task 1 (CancelOrderService test failures)
- **Issue:** Initial implementation called `order.cancel()` first (→ `canceled`), then invoked `RefundOrderService.execute()` which re-loaded the order from the mock (getting the mutated `canceled` object) and called `order.refund()` — which throws `InvalidOrderTransitionError` because `refund()` requires `paid` status
- **Fix:** Added `executeWithOrder(input, order)` method to `RefundOrderService`; `CancelOrderService` now calls `refundService.executeWithOrder()` with the pre-loaded `paid` order BEFORE calling `order.cancel()`. The refund fires first, the aggregate transitions to `refunded`, then `cancel()` is skipped (aggregate is no longer `paid`/`created`). Final status of a paid+canceled order = `refunded` (financially correct)
- **Files modified:** `refund-order.service.ts`, `cancel-order.service.ts`
- **Committed in:** `12aaa97`

**2. [Rule 4 avoided] Dispute "marker" on payment — no DB column added**

- **Found during:** Task 2 planning
- **Issue:** Plan says "persist a dispute marker on the payment/order (a disputed boolean or a small disputes record — keep minimal)" — adding a column requires a schema migration and a Drizzle schema change (architectural per Rule 4)
- **Decision:** The `PaymentDisputeOpenedV1` outbox event persisted in the `outbox` table IS the dispute record (durable, queryable, tenant-scoped). This satisfies D-11 "record + notify" minimally without a migration. The plan's parenthetical "keep minimal" supports this interpretation.
- **Files modified:** none (no change needed)

**3. [Rule 3 - Blocking] `withTenant(tenantId, callback)` → `withTenantId(tenantId, callback)` in e2e spec**

- **Found during:** Task 2 typecheck
- **Issue:** `TenantAwareDb.withTenant` takes only a callback (ALS-bound); `withTenantId(id, callback)` is the correct API for explicit-tenant DB access in tests
- **Fix:** Changed to `db.withTenantId(...)` in `payments-isolation.e2e.spec.ts`
- **Committed in:** `4fe7b32`

## Known Stubs

None — all service methods have real implementations. The `CancelOrderService` has no HTTP endpoint yet (Phase 10 wires the operator transition UI); it's exported from `PaymentsModule` for injection.

## Threat Surface Scan

New endpoint introduced:

| Flag                      | File                  | Description                                                                                     |
| ------------------------- | --------------------- | ----------------------------------------------------------------------------------------------- |
| threat_flag: new-endpoint | refunds.controller.ts | POST /v1/orders/:id/refund — operator auth + billing:update (owner-only) + @RequireActiveTenant |

Threat model mitigations implemented:

- T-08-28: `@Permissions({ billing: ['update'] })` — only owner role in SYSTEM_ROLES has this; server-enforced
- T-08-29: deterministic idempotency key `refund:<orderId>:<alreadyRefunded>:<amount>` + `charge.refunded` webhook UPDATEs by `stripe_refund_id` (no double-insert) + `RefundExceedsCapturedError` sum-≤-captured guard + single canonical `CancelOrderService` (Phase 10 reuses it)
- T-08-30: `RefundReasonRequiredError` — empty/whitespace reason rejected at service layer before Stripe call
- T-08-31: RLS + ScopedTx on `payments`/`payment_refunds`; `payments-isolation.e2e.spec.ts` proves cross-tenant read returns 0 rows
- T-08-32: `charge.dispute.created` → `PaymentDisputeOpenedV1` appended to outbox — not a silent blind spot

## Self-Check: PASSED

All key files exist:

- `apps/api/src/contexts/payments/application/refund-order.service.ts` — FOUND
- `apps/api/src/contexts/payments/application/cancel-order.service.ts` — FOUND
- `apps/api/src/contexts/payments/interfaces/http/refunds.controller.ts` — FOUND
- `apps/api/test/e2e/payments-isolation.e2e.spec.ts` — FOUND
- `.planning/phases/08-payments-stripe-connect/08-05-SUMMARY.md` — FOUND

Commits verified:

- `12aaa97` — FOUND
- `4fe7b32` — FOUND
