---
phase: 08-payments-stripe-connect
plan: 04a
subsystem: payments
tags:
  [
    stripe,
    checkout,
    payment-intent,
    can-accept-payments,
    sca,
    idempotency,
    ordering,
  ]

requires:
  - phase: 08-payments-stripe-connect
    plan: 03
    provides: PaymentRepository, HandleStripeEventService, payments bounded context

provides:
  - POST /v1/checkout/payment-intent — server-gated direct-charge PaymentIntent creation
  - GET /v1/orders/:id/status — read-only public order-status endpoint for SITE-08 poller
  - PaymentsNotEnabledError, CurrencyMismatchError, OrderNotCheckoutableError domain errors
  - CreateCheckoutPaymentService with canAcceptPayments gate + cancel-prior-PI + SCA
  - payments/application/dto.ts: CreatePaymentIntentInput, CreatePaymentIntentResponse
  - payments/interfaces/http/error-mapping.ts: mapPaymentError

affects:
  - 08-04b: consumes POST /v1/checkout/payment-intent (clientSecret) + GET /v1/orders/:id/status (poller)
  - 08-05: refund flow can reuse the payment row written by checkout
  - 08-06: guest email notifications triggered by payment events the checkout sets up

tech-stack:
  added: []
  patterns:
    - 'D-12 server gate: canAcceptPayments() checked before PaymentIntent creation — not just UI'
    - 'D-06 cancel-prior-PI: findByOrderId → cancelPaymentIntent if non-terminal → attempt++ before new PI'
    - 'D-08 SCA: order transitions created→requires_action; markPaid from webhook is the single writer of paid'
    - 'D-05 currency guard: order.currency must match tenant.defaultCurrency or CurrencyMismatchError'
    - 'Server-authoritative amount: toMinorUnits(snap.total) from server-computed order — never client price'
    - 'Env dual-accept: CreateCheckoutPaymentService accepts Env|number for STRIPE_APPLICATION_FEE_AMOUNT (testability)'

key-files:
  created:
    - apps/api/src/contexts/payments/application/create-checkout-payment.service.ts
    - apps/api/src/contexts/payments/application/create-checkout-payment.service.spec.ts
    - apps/api/src/contexts/payments/application/dto.ts
    - apps/api/src/contexts/payments/domain/errors.ts
    - apps/api/src/contexts/payments/interfaces/http/checkout.controller.ts
    - apps/api/src/contexts/payments/interfaces/http/error-mapping.ts
    - apps/api/src/contexts/ordering/interfaces/http/orders.controller.spec.ts
  modified:
    - apps/api/src/contexts/payments/payments.module.ts
    - apps/api/src/contexts/ordering/interfaces/http/orders.controller.ts
    - apps/api/src/contexts/ordering/ordering.module.ts
    - apps/api/src/contexts/ordering/infrastructure/order-drizzle.repository.ts

key-decisions:
  - 'CreateCheckoutPaymentService accepts Env|number for the fee to allow direct unit-test instantiation without NestJS DI (no test container setup needed)'
  - 'connectedAccountId null-guard after canAcceptPayments(): redundant from domain perspective but required to satisfy ESLint no-non-null-assertion; narrows string|null to string safely'
  - 'orderRepo.save and paymentRepo.upsertByPaymentIntentId are separate transactions — the D-06 double-charge guard is at the application layer (cancel + incremented attempt key), not at the DB transaction level'
  - 'GET /v1/orders/:id/status added to orders.controller.ts (not a new controller) — same @Public + @RequireActiveTenant convention as POST; delegates to GetOrderService (read-only)'
  - 'Phase 10 note in SUMMARY: the status projection is minimal; Phase 10 (ORDINT) may extend it with operator-transition history'

metrics:
  duration: 55min
  completed: 2026-06-27
  tasks: 2
  files_modified: 11
---

# Phase 8 Plan 04a: Checkout API — server-gated PaymentIntent + order-status read

**Server-authoritative checkout endpoint creates a direct-charge PaymentIntent gated on canAcceptPayments(), guards against double-charge via cancel-prior-PI, drives SCA requires_action state, and exposes a read-only order-status endpoint for the SITE-08 confirmation poller.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-06-27T15:40:00Z
- **Completed:** 2026-06-27T16:00:00Z
- **Tasks:** 2 auto (TDD)
- **Files modified:** 11

## Accomplishments

- **POST /v1/checkout/payment-intent** (`@Public`, `@RequireActiveTenant`): loads order + tenant server-side; enforces `canAcceptPayments()` gate (D-12); checks currency match (D-05); cancels prior non-terminal PaymentIntent before creating new one with incremented attempt (D-06); creates direct-charge PI via `StripeConnectPort`; transitions order `created→requires_action` (D-08); writes payment row (`status: requires_action`); returns `{ clientSecret, connectedAccountId, orderId }`.

- **GET /v1/orders/:id/status** (`@Public`, `@RequireActiveTenant`): read-only delegation to `GetOrderService`; returns `{ status, total, currency, orderNumber, eta? }`; no state mutations — webhook remains the single writer of `paid` (CTO HIGH #4).

- **Domain errors added** to `payments/domain/errors.ts`: `PaymentsNotEnabledError` (409), `CurrencyMismatchError` (422), `OrderNotCheckoutableError` (409). Error mapping in `payments/interfaces/http/error-mapping.ts`.

- **Rule 1 fix:** `order-drizzle.repository.ts` `ALLOWED_STATUSES` was missing `requires_action` — orders saved in that status by the checkout service could not be loaded back. Added `requires_action` to the set.

- **GetOrderService exported** from `OrderingModule` so the orders controller can inject it.

## Task Commits

| Task | Name                                                                             | Commit    | Key Files                                                                                                                           |
| ---- | -------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Checkout PaymentIntent endpoint (canAcceptPayments gate + cancel-prior-PI + SCA) | `2f40f99` | create-checkout-payment.service.ts, checkout.controller.ts, payments/domain/errors.ts, dto.ts, error-mapping.ts, payments.module.ts |
| 2    | Read-only GET /v1/orders/:id/status (SITE-08 substrate)                          | `7293fbc` | orders.controller.ts, orders.controller.spec.ts, ordering.module.ts                                                                 |

## Test Results

```
Task 1 spec: src/contexts/payments/application/create-checkout-payment.service.spec.ts
  ✓ 10 tests (canAcceptPayments gate ×2, amount/currency integrity ×2, D-06 ×3, D-08 ×2, return shape ×1)

Task 2 spec: src/contexts/ordering/interfaces/http/orders.controller.spec.ts
  ✓ 5 tests (returns status/total/currency/orderNumber, paid status, read-only assertion, not-found, eta)

Full suite: 577 tests / 73 files — all passing
tsc --noEmit — clean (exit 0)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `requires_action` missing from `ALLOWED_STATUSES` in `order-drizzle.repository.ts`**

- **Found during:** Task 1 implementation review
- **Issue:** The `ALLOWED_STATUSES` set in `OrderDrizzleRepository` did not include `requires_action`, which was added to the DB schema in 08-01. Any order transitioned to `requires_action` by the checkout service would throw `Unknown order status "requires_action" in DB` on next load.
- **Fix:** Added `requires_action` to `ALLOWED_STATUSES`.
- **Files modified:** `apps/api/src/contexts/ordering/infrastructure/order-drizzle.repository.ts`
- **Committed in:** `2f40f99` (Task 1)

**2. [Rule 2 - Missing Critical] `GetOrderService` not exported from `OrderingModule`**

- **Found during:** Task 2 wiring
- **Issue:** `OrdersController` now injects `GetOrderService` for the status endpoint. `GetOrderService` was provided inside `OrderingModule` but not exported, so it could not be injected into the controller via the module graph.
- **Fix:** Added `GetOrderService` to `OrderingModule` exports.
- **Files modified:** `apps/api/src/contexts/ordering/ordering.module.ts`
- **Committed in:** `7293fbc` (Task 2)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical).

## Known Stubs

None — all endpoints return live data from the order aggregate and Stripe adapter.

## Phase 10 Note

`GET /v1/orders/:id/status` projection is intentionally minimal (`status`, `total`, `currency`, `orderNumber`, `eta`). Phase 10 (ORDINT — operator order-transition UI) may extend this with transition history and operator-visible fields. The 08-04b confirmation page only needs the current status for its polling loop.

## Threat Surface Scan

| Flag                      | File                   | Description                                                                                                                                       |
| ------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| threat_flag: new-endpoint | checkout.controller.ts | POST /v1/checkout/payment-intent — @Public + @RequireActiveTenant; server-side canAcceptPayments gate (T-08-20); amount server-computed (T-08-19) |
| threat_flag: new-endpoint | orders.controller.ts   | GET /v1/orders/:id/status — @Public + @RequireActiveTenant; read-only (T-08-21)                                                                   |

All STRIDE mitigations from the plan's threat model implemented:

- T-08-19: amount = `toMinorUnits(snap.total)` from server-computed order total; client amounts never trusted
- T-08-20: `tenant.canAcceptPayments()` enforced server-side before PI creation
- T-08-21: GET status handler is read-only; uses `GetOrderService` with no write path
- T-08-22: cancel-prior-PI + incremented-attempt idempotency key before new PI creation

## Self-Check: PASSED

All key files exist:

- `apps/api/src/contexts/payments/application/create-checkout-payment.service.ts` — FOUND
- `apps/api/src/contexts/payments/application/create-checkout-payment.service.spec.ts` — FOUND
- `apps/api/src/contexts/payments/application/dto.ts` — FOUND
- `apps/api/src/contexts/payments/domain/errors.ts` — FOUND
- `apps/api/src/contexts/payments/interfaces/http/checkout.controller.ts` — FOUND
- `apps/api/src/contexts/payments/interfaces/http/error-mapping.ts` — FOUND
- `apps/api/src/contexts/ordering/interfaces/http/orders.controller.spec.ts` — FOUND
- Commit `2f40f99` — FOUND
- Commit `7293fbc` — FOUND
