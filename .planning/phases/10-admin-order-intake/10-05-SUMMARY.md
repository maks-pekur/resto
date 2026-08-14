---
phase: 10-admin-order-intake
plan: 05
subsystem: payments

tags: [stripe, refunds, drizzle, postgres, transactions, idempotency, cancel]

# Dependency graph
requires:
  - phase: 10-admin-order-intake plan 01
    provides: orders table's 15 intake columns (cancel actor/reason/note, canceled_from_status) and their CHECK constraints
  - phase: 10-admin-order-intake plan 03
    provides: Order.cancel(reasonCode, cancelNote, actorUserId, now) widened to every pre-completion status and the sole terminal-status writer; Order.refund() stripped of its order-status-rewriting bug; CancelOrderService/RefundOrderService left with the minimum call-site adaptation and an explicit deferral of the wasPaid/currentStatus rewrite to this plan
provides:
  - CancelOrderService with no order-status gate at all -- refundability derived solely from the captured payment row (CTO HIGH-7 closed); reasonCode/cancelNote/actorUserId input; always a full remaining-amount refund (D-10)
  - RefundOrderService restructured into TX2 (pending ledger row) / Stripe call outside any open transaction / TX3 (outcome), so a Stripe outage can never roll back a commit (D-11)
  - RetryRefundService -- retries only the provider call + outcome for an existing failed payment_refunds row, reusing the original refundRequestId as both ledger key and Stripe idempotency key
  - payment_refunds schema: nullable stripe_refund_id, NOT NULL refund_request_id (idempotency key), failure_reason, updated_at; migration 0076 applied to the shared dev database
  - PaymentRepository: findRefundByRequestId, updateRefundOutcome, updateRefundStatusByStripeId, findFailedRefundsForOrders
  - e2e proof (apps/api/test/e2e/order-cancel-refund.e2e.spec.ts, 9 cases) reading every assertion back from a real Postgres testcontainer
affects:
  [
    10-08 (admin controller wiring for cancel/retry will call CancelOrderService/RetryRefundService and consume CancelOrderInputSchema),
    admin order feed/detail UI (findFailedRefundsForOrders backs the retry-flag/banner from UI-SPEC §9),
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Persist-then-external-call-then-persist-outcome: three short db.withTenant transactions with the untrusted external call (Stripe) strictly between the second and third, so a provider failure can never roll back a prior commit -- first precedent for this pattern in the payments context'
    - 'Discriminated-union TX prep result (RefundPrep) carries pre-narrowed non-null fields out of a transaction closure, avoiding `!`/`as` assertions at the call site outside it (repo forbids @typescript-eslint/no-non-null-assertion)'

key-files:
  created:
    - apps/api/src/contexts/payments/application/retry-refund.service.ts
    - apps/api/test/e2e/order-cancel-refund.e2e.spec.ts
    - packages/db/migrations/0076_payment_refunds_pending.sql
  modified:
    - packages/db/src/schema/ordering.ts
    - packages/db/migrations/meta/_journal.json
    - apps/api/src/contexts/payments/domain/ports.ts
    - apps/api/src/contexts/payments/domain/errors.ts
    - apps/api/src/contexts/payments/infrastructure/payment-drizzle.repository.ts
    - apps/api/src/contexts/payments/application/cancel-order.service.ts
    - apps/api/src/contexts/payments/application/refund-order.service.ts
    - apps/api/src/contexts/payments/application/dto.ts
    - apps/api/src/contexts/payments/payments.module.ts
    - apps/api/src/contexts/payments/application/cancel-order.service.spec.ts
    - apps/api/src/contexts/payments/application/refund-order.service.spec.ts
    - apps/api/src/contexts/payments/application/create-checkout-payment.service.spec.ts
    - apps/api/src/contexts/payments/application/handle-stripe-event.service.spec.ts
    - apps/api/test/e2e/payment-lifecycle.e2e.spec.ts
    - .planning/phases/10-admin-order-intake/deferred-items.md

key-decisions:
  - 'CancelOrderService accepts no amountMinor -- the refund is always full remaining captured (D-10); a cashier cancelling makes no financial judgement, arbitrary amounts stay on the billing:update refund route'
  - "order.refund()'s validation call happens inside TX2 (before Stripe), but orderRepo.update() -- which flushes the queued OrderRefunded domain event -- only happens in TX3's success branch, so the event is never recorded for a refund that didn't actually happen"
  - 'RetryRefundService never touches the Order aggregate at all (no orderRepo dependency) -- it re-reads payments.refundedAmount fresh inside its own TX3 rather than trusting a value captured before the provider call, narrowing (not eliminating) the race with a concurrent webhook reconciliation'
  - 'updateRefundStatusByStripeId kept as a thin companion to updateRefundOutcome for the inbound webhook direction even though HandleStripeEventService.handleRefund() does not currently call it (PAY-BUG6, pre-existing accepted gap) -- preserves the port contract for whoever closes that gap'
  - "CancelOrderInputSchema's reasonCode enum and cancelNote max(500) cap live in payments/application/dto.ts, duplicating order.aggregate.ts's CANCEL_REASON_CODES list rather than importing it (that list is module-private, not exported) -- same three-layer duplication (aggregate/DTO/DB CHECK) already established by 10-03"

requirements-completed: [ORDINT-03, ORDINT-05, ORDINT-06]

# Metrics
duration: ~100min
completed: 2026-08-15
---

# Phase 10 Plan 05: Cancel/Refund D-11 Restructure Summary

**`CancelOrderService`'s `wasPaid` order-status gate is deleted (CTO HIGH-7 closed) -- refundability now comes solely from the captured payment row; `RefundOrderService` is split into three short transactions with the Stripe call strictly outside all of them (D-11), so a provider failure marks a `payment_refunds` row `failed` without ever rolling back the cancel; a new `RetryRefundService` replays only the provider call, reusing the original idempotency key so a retry can never double-refund -- all proven by a 9-case e2e spec that reads every assertion back from a real Postgres testcontainer.**

## Performance

- **Duration:** ~100 min
- **Completed:** 2026-08-15
- **Tasks:** 3 completed
- **Files modified:** 18 (3 created, 15 modified)

## Accomplishments

- **CTO HIGH-7 closed.** `CancelOrderService`'s `wasPaid = snap.status === 'paid'` predicate and the `currentStatus === 'paid' || 'created'` persistence gate are both deleted, not patched. Refundability now comes exclusively from `RefundOrderService`'s own payment-row lookup (`PaymentNotRefundableError` when nothing is captured) — there is no order-status check anywhere in the cancel path. Proven for `accepted`/`preparing`/`ready` by an `it.each` regression test naming the bug directly.
- **D-11 transaction restructure.** `RefundOrderService.executeWithOrder` is now three `db.withTenant` blocks with the Stripe call strictly between the second and third: **TX2** looks up the payment, short-circuits on an already-succeeded exact-request replay, validates the amount via `order.refund()`, and writes a `pending` `payment_refunds` row (no Stripe id yet) — then commits. The **provider call** (`this.provider.createRefund(...)`, line 179) is not lexically inside any `db.withTenant(` callback — TX2 closes at line 153, TX3 opens at line 213. **TX3** applies the outcome: on success, `updateRefundOutcome` to `succeeded`, updates `payments.refundedAmount`/`status`, flushes the `OrderRefunded` domain event `order.refund()` queued back in TX2, and appends the outbox event; on failure (any thrown error from the provider), a separate TX3 marks the same row `failed` with a truncated `failureReason` and rethrows a typed `RefundProviderFailedError` — the order and TX2's commit are never touched.
- **`CancelOrderService` never rolls back the kitchen.** TX1 (`order.cancel()` + `orderRepo.update(order)` with no explicit tx, opening/committing its own transaction) always commits before the refund is even attempted. A `PaymentNotRefundableError` from the refund attempt is treated as a normal "nothing to refund" outcome (`created`, unpaid order); a `RefundProviderFailedError` is caught and reported as `{ outcome: 'failed' }` while the cancel itself stands.
- **`RetryRefundService`** (new) re-runs only the provider call and TX3-equivalent outcome application for an existing `failed` `payment_refunds` row — it injects no `OrderRepository` at all, so it structurally cannot call `order.cancel()` or `order.refund()` again. It reuses the _original_ `refundRequestId` (both the ledger idempotency key and Stripe's own idempotency key), rejects with `RefundNotRetryableError` on any row that isn't `failed` (including "not found"), and re-reads `payments.refundedAmount` fresh inside its own transaction before computing the new total.
- **Migration `0076_payment_refunds_pending.sql`** (applied to the shared dev Postgres, verified live): `stripe_refund_id` made nullable, `refund_request_id text NOT NULL` added (existing rows backfilled `legacy:{id}`), `failure_reason`/`updated_at` added, new unique index `payment_refunds_request_id_uq` on `(tenant_id, refund_request_id)` alongside the untouched `payment_refunds_stripe_refund_id_uq`.
- **e2e proof** (`order-cancel-refund.e2e.spec.ts`, 9 cases, real Postgres testcontainer, only `PaymentProviderPort` mocked): cancel from `accepted`/`preparing`/`ready` each issue a full refund (the CTO HIGH-7 regression case, with a WHY-comment stating it would have failed pre-plan); cancel from `created` attempts no refund and leaves zero ledger rows; a Stripe failure during cancel still lands the order on `canceled` with exactly one `failed` ledger row; a retry flips that _same_ row to `succeeded` (row count stays 1) reusing the identical `refundRequestId`; a retry on an already-`succeeded` row is rejected; a discretionary partial refund on a `preparing` order leaves it `preparing` (D-10); a cross-tenant cancel attempt existence-hides via `OrderNotFoundError` and leaves the real order untouched.

## Task 1 — Raw Catalog Query Output

**Migration apply (`pnpm --filter @resto/db db:migrate`, exit 0):**

```
{"level":30,...,"msg":"Applying migrations…"}
NOTICE: schema "drizzle" already exists, skipping
NOTICE: relation "__drizzle_migrations" already exists, skipping
{"level":30,...,"msg":"Migrations applied."}
```

**`information_schema.columns` for `payment_refunds` (the 4 changed/new columns):**

```json
[
  { "column_name": "failure_reason", "is_nullable": "YES" },
  { "column_name": "refund_request_id", "is_nullable": "NO" },
  { "column_name": "stripe_refund_id", "is_nullable": "YES" },
  { "column_name": "updated_at", "is_nullable": "NO" }
]
```

`stripe_refund_id` is nullable; `refund_request_id` is `NOT NULL` — matches the acceptance criteria exactly.

**`pg_indexes` for `payment_refunds`:**

```json
[
  { "indexname": "payment_refunds_pkey" },
  { "indexname": "payment_refunds_request_id_uq" },
  { "indexname": "payment_refunds_stripe_refund_id_uq" }
]
```

Both the new `payment_refunds_request_id_uq` and the untouched `payment_refunds_stripe_refund_id_uq` are present.

## D-11 Transaction Boundary — Line Numbers

In `apps/api/src/contexts/payments/application/refund-order.service.ts` (post-restructure):

- **TX2** opens at line 93 (`const prep: RefundPrep = await this.db.withTenant(async (tx) => {`) and **closes at line 153** (`});`).
- **Provider call** — `await this.provider.createRefund({...})` — sits at **line 179**, in the `try` block between TX2's close and TX3's open. It is not lexically inside any `db.withTenant(` callback.
- **TX3 (failure branch)** opens at line 190, inside the `catch` block, and only calls `updateRefundOutcome` — never touches the order.
- **TX3 (success branch)** opens at **line 213** (`return this.db.withTenant(async (tx) => {`).

## Task Commits

Each task was committed atomically:

1. **Task 1: [BLOCKING] Migration 0076 — pending refund rows keyed by refund_request_id** - `4925ee2` (feat)
2. **Task 2: Restructure cancel and refund — payment-derived refundability, Stripe outside the transaction, retry** - `334746f` (feat)
3. **Task 3: e2e proof of cancel, refund failure and retry — read back from Postgres** - `46958ed` (test)

## Files Created/Modified

- `packages/db/src/schema/ordering.ts` - `paymentRefunds`: `stripeRefundId` nullable, new `refundRequestId`/`failureReason`/`updatedAt`, new unique index
- `packages/db/migrations/0076_payment_refunds_pending.sql` - the hand-written migration, applied and verified against the live shared dev database
- `packages/db/migrations/meta/_journal.json` - journal entry idx 76 appended
- `apps/api/src/contexts/payments/domain/ports.ts` - `PaymentRefundRow`/`UpsertPaymentRefundInput` widened; new `UpdateRefundOutcomeInput`; `PaymentRepository` gains `findRefundByRequestId`/`updateRefundOutcome`/`updateRefundStatusByStripeId`/`findFailedRefundsForOrders`, drops `updateRefundStatus`
- `apps/api/src/contexts/payments/domain/errors.ts` - new `RefundProviderFailedError`, `RefundNotRetryableError`
- `apps/api/src/contexts/payments/infrastructure/payment-drizzle.repository.ts` - all port additions implemented; `upsertRefund`'s conflict target moved to `(tenant_id, refund_request_id)`
- `apps/api/src/contexts/payments/application/cancel-order.service.ts` - full rewrite: `reasonCode`/`cancelNote`/`actorUserId` input, TX1-then-unconditional-refund-attempt flow, structured `CancelOrderResult`
- `apps/api/src/contexts/payments/application/refund-order.service.ts` - full rewrite: TX2/provider/TX3 split, idempotent short-circuit, assertion-free non-null narrowing carried out of the TX2 closure
- `apps/api/src/contexts/payments/application/retry-refund.service.ts` (new) - retry-only service, no `OrderRepository` dependency
- `apps/api/src/contexts/payments/application/dto.ts` - `CancelOrderInputSchema` (7-code enum + `cancelNote.max(500)`)
- `apps/api/src/contexts/payments/payments.module.ts` - `RetryRefundService` registered and exported
- `apps/api/src/contexts/payments/application/cancel-order.service.spec.ts`, `refund-order.service.spec.ts` - rewritten for the new shapes; added CTO HIGH-7 `it.each` regression, D-11 provider-failure test, idempotent-short-circuit test
- `apps/api/src/contexts/payments/application/create-checkout-payment.service.spec.ts`, `handle-stripe-event.service.spec.ts`, `apps/api/test/e2e/payment-lifecycle.e2e.spec.ts` - ripple-effect adaptation to the widened `PaymentRepository` port / new `CancelOrderInput` shape (Rule 3)
- `apps/api/test/e2e/order-cancel-refund.e2e.spec.ts` (new) - 9-case DB read-back proof
- `.planning/phases/10-admin-order-intake/deferred-items.md` - logged a pre-existing, unrelated `payments-isolation.e2e.spec.ts` fixture gap discovered while verifying no regression in adjacent e2e specs

## Decisions Made

- `CancelOrderService` accepts no `amountMinor` at all — the refund is always the full remaining captured amount (D-10); arbitrary-amount refunds stay exclusively on the existing `billing:update`-gated `RefundsController` route.
- `order.refund()`'s validation call runs inside TX2 (before Stripe), but `orderRepo.update()` — which is what actually flushes the `OrderRefunded` domain event `order.refund()` queues — is deferred to TX3's success branch only. A refund that fails at Stripe therefore never leaves a false `OrderRefunded` event in the outbox, even though `order.refund()` was already called.
- `RetryRefundService` is deliberately not given an `OrderRepository` dependency at all, making "never re-cancel or re-refund the order" a structural guarantee rather than a discipline one. It re-reads `payments.refundedAmount` fresh inside its own TX3 (not trusting the value captured before the provider call) to narrow — not fully eliminate, that residual race is the pre-existing PAY-BUG6 gap — the window against a concurrent webhook reconciliation.
- `updateRefundStatusByStripeId` was added as a companion to `updateRefundOutcome` per the plan's instruction to preserve the inbound-webhook-reconciliation direction, even though `HandleStripeEventService.handleRefund()` does not currently call any refund-row-keyed update method at all (it only updates `payments.status`, a pre-existing gap tracked as PAY-BUG6, out of this plan's scope). The port contract stays intact for whoever closes that gap.
- Assertion-free non-null narrowing: rather than `payment.paymentIntentId as string` (rejected by `@typescript-eslint/non-nullable-type-assertion-style`, which prefers `!` — itself forbidden by this repo's `no-non-null-assertion` rule), both `RefundOrderService` and `RetryRefundService` narrow `paymentIntentId`/`stripeAccountId` to local `const`s immediately after the null guard, inside the transaction closure, and carry those pre-narrowed strings out via the `RefundPrep`/prep return type instead of re-deriving them from the raw `PaymentRow` after the closure returns (where TypeScript's control-flow narrowing no longer applies).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — blocking] Ripple-effect breakage in 3 files outside this plan's stated file list**

- **Found during:** Task 1 (typecheck immediately after the port change) and Task 2 (after rewriting `CancelOrderInput`'s shape)
- **Issue:** `pnpm --filter api exec tsc --noEmit` surfaced compile errors in `create-checkout-payment.service.spec.ts` and `handle-stripe-event.service.spec.ts` (both build a fake `PaymentRepository` via a mapped type over every port key — `updateRefundStatus` no longer exists), and in `payment-lifecycle.e2e.spec.ts` (two `cancelService.execute({ ..., reason: '...' })` call sites calling the now-`reasonCode`/`cancelNote`/`actorUserId` shape). None of these three files are in Plan 10-05's stated `<files>` lists, but the plan's own `<verification>` section requires a clean `tsc --noEmit` and a green `payment-lifecycle` run, which is impossible without adapting them.
- **Fix:** Minimal, non-scope-creeping adaptations only: updated the two spec files' fake `PaymentRepository` object literals to the new port shape (`findRefundByRequestId`/`updateRefundOutcome`/`updateRefundStatusByStripeId`/`findFailedRefundsForOrders`); converted the two `cancelService.execute()` call sites in the e2e spec to `{ reasonCode, cancelNote, actorUserId: null }`.
- **Files modified:** `apps/api/src/contexts/payments/application/create-checkout-payment.service.spec.ts`, `apps/api/src/contexts/payments/application/handle-stripe-event.service.spec.ts`, `apps/api/test/e2e/payment-lifecycle.e2e.spec.ts`
- **Verification:** `pnpm typecheck` clean across all 11 projects; `pnpm nx run api:test` (95 files / 793 tests) green; `payment-lifecycle.e2e.spec.ts` re-run in isolation, 6/6 green.
- **Committed in:** `334746f` (Task 2)

**2. [Rule 1 — self-caught lint/type conflict] `as string` casts rejected by a stricter, mutually-exclusive lint rule pair**

- **Found during:** Task 2, first commit attempt (pre-commit `eslint --fix` failed the commit)
- **Issue:** The provider-call site in both `RefundOrderService` and `RetryRefundService` originally used `payment.paymentIntentId as string` / `payment.stripeAccountId as string` to strip the `string | null` type after an already-performed runtime null check. `@typescript-eslint/non-nullable-type-assertion-style` flagged these, wanting a `!` assertion instead — but this repo's `@typescript-eslint/no-non-null-assertion: error` forbids `!` outright. Neither form satisfies both rules simultaneously.
- **Fix:** Re-derived the fix at the type-narrowing level instead of the assertion level: extracted `paymentIntentId`/`stripeAccountId` as local `const`s immediately after the null guard (where TS's control-flow narrowing still applies), and carried them out of the transaction closure as explicit non-nullable fields on the `RefundPrep` discriminated-union type (and the equivalent inline object in `RetryRefundService`) rather than re-reading `payment.paymentIntentId` after the closure returns.
- **Files modified:** `apps/api/src/contexts/payments/application/refund-order.service.ts`, `apps/api/src/contexts/payments/application/retry-refund.service.ts`
- **Verification:** `eslint` clean on both files; `tsc --noEmit` clean; the 4-spec-file and both e2e-spec vitest runs re-executed green after the fix, confirming no behavioral change from the pure type-level refactor.
- **Committed in:** `334746f` (Task 2)

**3. [Rule 1 — lint cleanup] New e2e spec's provider-mock reassignments tripped 3 more lint rules**

- **Found during:** Task 3, first lint pass on the new e2e spec before committing
- **Issue:** Several `providerMock.createRefund = async (...) => {...}` reassignments in `order-cancel-refund.e2e.spec.ts` had no `await` inside (`@typescript-eslint/require-await`), one had an unused destructured `input` parameter, and `eslint --fix`'s own auto-fix attempt for the `non-nullable-type-assertion-style` findings on two `readRefundRows(...)[0]?.refundRequestId` reads introduced forbidden `!` assertions.
- **Fix:** Dropped the unnecessary `async` keyword and returned `Promise.resolve(...)`/`Promise.reject(...)` directly where no `await` was needed; renamed the unused parameter; replaced the two `!`-asserted reads with an explicit `if (!row) throw new Error(...)` guard before use (also improves test failure diagnostics — a genuinely empty result array now fails with a clear message instead of a generic `undefined` access).
- **Files modified:** `apps/api/test/e2e/order-cancel-refund.e2e.spec.ts`
- **Verification:** `eslint` clean; `tsc --noEmit` clean; spec re-run, 9/9 green.
- **Committed in:** `46958ed` (Task 3)

---

**Total deviations:** 3 (1 Rule 3 ripple-effect fix, 2 Rule 1 lint/type-safety self-corrections)
**Impact on plan:** All auto-fixes were necessary to keep the repository compiling, lint-clean, and its existing test suite green after this plan's (in-scope) restructuring. None expand the plan's functional scope; the lint-driven fixes strictly improved type safety (no non-null assertions anywhere in the new/changed code) without changing runtime behavior, verified by re-running every affected test after each fix.

## Issues Encountered

- Same environment-setup pattern as every prior Phase 10 plan: this worktree had no `node_modules` and no `.env` (both gitignored, not shared across git worktrees) — resolved by running `pnpm install` and copying the root `.env` before any DB-touching command.
- `pnpm --filter @resto/db db:migrate` failed with "DATABASE_ADMIN_URL (preferred) or DATABASE_URL is required" when invoked via plain `pnpm --filter` (it does not auto-load `.env`); resolved by passing `DATABASE_ADMIN_URL` explicitly on the command line, matching the precedent already documented in 10-04's summary.
- While verifying no regression in adjacent e2e specs, discovered `apps/api/test/e2e/payments-isolation.e2e.spec.ts` is pre-existing broken (unrelated `orders.location_id NOT NULL` gap from Phase 08.4, confirmed via `git status --short` showing zero diff on that file). Logged in `deferred-items.md`, not fixed (out of scope — Rule boundary), along with a note that its `payment_refunds` raw-SQL insert will also need a `refund_request_id` value once that gap is picked up.

## User Setup Required

None — no external service configuration required. Migration 0076 was applied directly to the existing shared local dev Postgres container (`resto-postgres`, port 5433), which was already running.

## Next Phase Readiness

- The money path (cancel/refund/retry) is now correct at the domain and persistence layer: refundability is payment-derived (CTO HIGH-7 closed), a Stripe outage can never block a cancel or roll back a commit (D-11), and a retry cannot double-refund.
- `RetryRefundService` is registered and exported from `PaymentsModule`, ready for Plan 10-08's controller wiring (`CancelOrderInputSchema`/`CancelOrderInputDto` are the HTTP-boundary shapes it needs).
- `findFailedRefundsForOrders` is ready for the admin feed's failed-refund banner/retry-flag (UI-SPEC §9), not yet wired into any controller.
- No blockers for 10-08. `payments-isolation.e2e.spec.ts`'s pre-existing brokenness (see Issues Encountered) is tracked in `deferred-items.md`, not attributable to this plan.

## Self-Check: PASSED

All modified/created files verified present on disk; all 3 commit hashes (`4925ee2`, `334746f`, `46958ed`) verified in `git log --oneline --all`.

---

_Plan: 10-admin-order-intake/05_
_Completed: 2026-08-15_
