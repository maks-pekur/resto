---
phase: 08-payments-stripe-connect
plan: "03"
subsystem: payments
tags: [stripe, webhook, signature-verify, runDeduped, idempotency, double-charge, orphan-refund]
dependency_graph:
  requires: ["08-01", "08-02"]
  provides: ["08-04a", "08-04b", "08-05", "08-06"]
  affects: [ordering, tenancy, events]
tech_stack:
  added:
    - packages/events/src/contracts/payments.ts (four v1 event contracts)
    - apps/api/src/contexts/payments/ (new bounded context)
  patterns:
    - raw-body content-type parser scoped per route (Fastify addContentTypeParser)
    - pseudo-envelope pattern for runDeduped keyed on Stripe event.id
    - W3 no-op: unknown-account events logged and returned 200 before runDeduped
    - D-06 orphan guard: late-succeeding PI on paid order triggers idempotent auto-refund
key_files:
  created:
    - packages/events/src/contracts/payments.ts
    - apps/api/src/contexts/payments/interfaces/http/stripe-webhook.controller.ts
    - apps/api/src/contexts/payments/interfaces/http/stripe-webhook.controller.spec.ts
    - apps/api/src/contexts/payments/application/handle-stripe-event.service.ts
    - apps/api/src/contexts/payments/application/handle-stripe-event.service.spec.ts
    - apps/api/src/contexts/payments/domain/ports.ts
    - apps/api/src/contexts/payments/infrastructure/payment-drizzle.repository.ts
    - apps/api/src/contexts/payments/payments.module.ts
  modified:
    - apps/api/src/shared/security.ts
    - apps/api/src/app.module.ts
    - apps/api/src/contexts/tenancy/tenancy.module.ts
    - apps/api/src/contexts/tenancy/domain/ports.ts
    - apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts
    - apps/api/src/contexts/ordering/ordering.module.ts
    - packages/events/src/index.ts
    - test/unit/prod-guardrails.spec.ts
    - test/unit/identity/identity-boot-integration.spec.ts
    - 6 × test/unit/{tenancy,shared}/*.spec.ts (mock extension)
decisions:
  - W3 no-op check happens BEFORE runDeduped — unknown account logs warn + returns 200; runDeduped requires valid tenantId so the check cannot move inside it
  - D-06 orphan auto-refund: createRefund called OUTSIDE the transaction (external side effect); deterministic idempotency key `orphan:<paymentIntentId>` prevents double-refund on webhook retry
  - runDeduped injected via optional constructor param for testability — avoids real DB/inbox in unit tests while keeping the integration path correct
  - Fastify content-type parser registered with `{ parseAs: 'buffer' }` gated on `req.url === '/webhook/stripe'`; other routes fall through to standard JSON parse
metrics:
  duration_minutes: 29
  completed: "2026-06-27"
  tasks_completed: 2
  files_changed: 20
---

# Phase 08 Plan 03: Stripe Webhook Ingestion Summary

One-liner: Signature-verified raw-body webhook at /webhook/stripe using `constructEvent` + `runDeduped` on event.id; handles five event types idempotently with W3 no-op and D-06 double-charge orphan auto-refund.

## Tasks Completed

| Task | Name                                                                   | Commit  | Key Files                                                                         |
| ---- | ---------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| 1    | Raw-body webhook route + signature verify + payment-event contracts    | a6a7b31 | stripe-webhook.controller.ts, security.ts, contracts/payments.ts                  |
| 2    | Event dispatch via runDeduped + all handlers + PaymentRepository       | 0d521ea | handle-stripe-event.service.ts, payment-drizzle.repository.ts, payments.module.ts |
| —    | Rule 1: add Stripe keys to prod-guardrails + boot-integration fixtures | 47282cc | test/unit/prod-guardrails.spec.ts, identity-boot-integration.spec.ts              |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing prod-guardrails test failures from 08-02**

- **Found during:** Task 1 test run
- **Issue:** `test/unit/prod-guardrails.spec.ts` `okProdValues` fixture lacked `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, causing 3 tests to fail after 08-02 added guardrail checks for those keys
- **Fix:** Added both keys to `okProdValues` in `prod-guardrails.spec.ts` and to `buildProdEnv` in `identity-boot-integration.spec.ts` (same root cause)
- **Files modified:** `test/unit/prod-guardrails.spec.ts`, `test/unit/identity/identity-boot-integration.spec.ts`
- **Commit:** 47282cc

**2. [Rule 2 - Missing] `findByStripeAccountId` not yet in TenantRepository interface**

- **Found during:** Task 2 — handler needed to resolve a tenant from `event.account`
- **Fix:** Added `findByStripeAccountId(stripeAccountId: string): Promise<Tenant | null>` to `TenantRepository` interface in `domain/ports.ts`, implemented in `tenant-drizzle.repository.ts` using `withoutTenant`, and added the mock stub to all six affected unit test files
- **Files modified:** `tenancy/domain/ports.ts`, `tenancy/infrastructure/tenant-drizzle.repository.ts`, 6 × spec files
- **Commit:** 0d521ea

**3. [Rule 2 - Missing] OrderingModule did not export ORDER_REPOSITORY**

- **Found during:** Task 2 — PaymentsModule imports OrderingModule and needs `ORDER_REPOSITORY`
- **Fix:** Added `exports: [ORDER_REPOSITORY]` to `OrderingModule`
- **Files modified:** `apps/api/src/contexts/ordering/ordering.module.ts`
- **Commit:** 0d521ea

**4. [Rule 2 - Missing] TenancyModule did not export STRIPE_CONNECT_PORT**

- **Found during:** Task 2 — PaymentsModule needs the port for orphan auto-refund
- **Fix:** Added `STRIPE_CONNECT_PORT` to `TenancyModule` exports
- **Files modified:** `apps/api/src/contexts/tenancy/tenancy.module.ts`
- **Commit:** 0d521ea

## Verification Results

- `pnpm --filter @resto/events typecheck`: green
- `pnpm --filter @resto/api typecheck`: green (tsc --noEmit clean)
- Unit: 61 test files / 449 tests all passing
- `stripe-webhook.controller.spec.ts`: 5 tests — missing sig → 400, invalid sig → 400, no rawBody → 400, no secret → 400, valid sig → 200 + handler called
- `handle-stripe-event.service.spec.ts`: 7 tests — succeeded → paid, idempotent replay (runDeduped skip), out-of-order failed-after-succeeded (no clobber), D-06 orphan guard (auto-refund called), account.updated → capabilities sync, W3 unknown account → no-op, dispute.created → event appended

## Security / Threat Surface

All STRIDE threats from the plan are mitigated:

- T-08-13: `constructEvent` on raw Buffer; 400 on bad sig
- T-08-14: `runDeduped` keyed on `event.id`
- T-08-15: `payment_failed` handler never touches a paid order
- T-08-16: orphan PI auto-refunded with deterministic key `orphan:<piId>`
- T-08-17: every write filtered by `tenantId` inside BYPASSRLS tx
- T-08-18: webhook exempt from per-tenant rate-limit bucket + CORS
- T-08-18b: unknown account → warn + 200; never throws

## Known Stubs

None — all handlers write real state transitions or perform real refund calls.

## Self-Check: PASSED

All key files exist. All three task commits (a6a7b31, 0d521ea, 47282cc) present in history.
