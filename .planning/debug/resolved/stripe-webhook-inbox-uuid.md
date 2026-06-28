---
slug: stripe-webhook-inbox-uuid
status: resolved
created: 2026-06-28
updated: 2026-06-28
---

# Debug Session: Stripe webhook 500 — inbox*processed.event_id uuid vs Stripe evt* id

## Trigger

User-reported (verbatim): Phase 8 payments webhook is fully broken at runtime. Every Stripe webhook POST to `/webhook/stripe` returns 500. Discovered while running a live Stripe Connect smoke (demo tenant `1499eff7-3f68-4385-9e5a-31307b65b6e1`, connected account `acct_1TnERu2Kh1rNoqvM`).

## Symptoms

1. **Expected behavior:** A Stripe webhook (`account.updated`, `payment_intent.succeeded`, `charge.refunded`) POSTed to `/webhook/stripe` is verified, deduped via `runDeduped`, and its side effect (sync charges_enabled / mark order paid / mark refunded) is applied. Returns 2xx.
2. **Actual behavior:** Every webhook returns HTTP 500. The `HandleStripeEventService` logs "Stripe webhook received" then the request fails on the inbox dedup INSERT before any side effect runs.
3. **Error message:** PostgresError `22P02` invalid input syntax for type uuid (routine `string_to_uuid`, file uuid.c:133) on `insert into "inbox_processed" ("event_id","consumer","tenant_id","processed_at") values ($1,$2,$3,default) on conflict do nothing returning "event_id"` with `$1 = 'evt_1TnEy52Kh1rNoqvMe2LAMDxr'`, `$2 = 'payments-webhook'`, `$3 = '1499eff7-...'`.
4. **Timeline:** Present since Phase 8 introduced the payments webhook consumer. Never worked at runtime against a real DB.
5. **Reproduction:** With api running + `stripe listen --forward-to localhost:3000/webhook/stripe` active, trigger any connected-account event (e.g. touch account metadata to fire `account.updated`). Webhook forwards → 500. Live-confirmed: demo tenant is `charges_enabled:true` in Stripe but `stripe_charges_enabled=false` in DB because `account.updated` keeps 500ing; `POST /v1/checkout/payment-intent` consequently returns 409 `payments.not_enabled`.

## Evidence

- timestamp: 2026-06-28 — api log shows `[HandleStripeEventService] Stripe webhook received` `{type: account.updated}` immediately followed by `[ProblemDetailsFilter] ERROR` with PostgresError `22P02` / `string_to_uuid` on the `inbox_processed` INSERT; problem instance `/webhook/stripe`, status 500. Failed param `$1 = 'evt_1TnEy52Kh1rNoqvMe2LAMDxr'`.
- timestamp: 2026-06-28 — `information_schema.columns` for `inbox_processed`: `event_id uuid`, `consumer text`, `tenant_id uuid`, `processed_at timestamptz`. PK = (event_id, consumer).
- timestamp: 2026-06-28 — `packages/db/src/schema/inbox.ts:24` declares `eventId: uuid('event_id').notNull()`; PK at line 32 `primaryKey({ columns: [table.eventId, table.consumer] })`.
- timestamp: 2026-06-28 — `apps/api/src/contexts/payments/application/handle-stripe-event.service.ts` builds `pseudoEnvelope = { id: event.id, tenantId }` (event.id = Stripe `evt_...`) and calls `this.runDedupedFn(this.db, pseudoEnvelope, 'payments-webhook', ...)` at lines 139/169/271/346/438. `runDeduped` inserts `envelope.id` into `inbox_processed.event_id` (uuid) → 22P02.
- timestamp: 2026-06-28 — `handle-stripe-event.service.spec.ts` MOCKS `runDeduped` (`runDedupedMock`), so the uuid-typed insert is never exercised by the only handler test. No e2e posts to `/webhook/stripe` against a real DB. This is the test gap that hid the bug.
- timestamp: 2026-06-28 (fix verification) — Pre-fix dependency check: no RLS policy references `event_id` type; no FK references `inbox_processed.event_id`; the composite PK `(event_id, consumer)` survives ALTER COLUMN TYPE without rebuild issues; all other `runDeduped` callers pass NATS envelope IDs (which are valid UUIDs) so widening to varchar is backward-compatible.
- timestamp: 2026-06-28 (fix verification) — Column type post-migration: `SELECT column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_name = 'inbox_processed' AND column_name = 'event_id'` → `character varying | 255`. Confirmed.
- timestamp: 2026-06-28 (fix verification) — Unit test: `handle-stripe-event.service.spec.ts` — 7 tests passed.
- timestamp: 2026-06-28 (fix verification) — E2e test: `stripe-webhook-inbox-dedup.e2e.spec.ts` — 2 tests passed (inbox INSERT with `evt_` id succeeds + idempotency dedup skips second delivery).
- timestamp: 2026-06-28 (fix verification) — TypeScript: `tsc --noEmit` clean for both `@resto/db` and `api`.

## Root Cause (confirmed)

`inbox_processed.event_id` is typed `uuid`, but the payments webhook consumer legitimately uses the Stripe event id (`evt_...`, not a UUID) as the dedup key. The dedup INSERT therefore fails with Postgres `22P02` for every Stripe webhook, 500ing the handler before any side effect. The inbox dedup ledger is a generic at-most-once table whose key should be any opaque string, not specifically a UUID — constraining it to `uuid` was an over-specification that the Phase 8 Stripe integration violated.

## Eliminated

- hypothesis: RLS policy or FK constraint on `inbox_processed.event_id` would block ALTER COLUMN TYPE
  evidence: grep of `packages/db/migrations/` and `packages/db/sql/` shows no REFERENCES to `inbox_processed.event_id` and no RLS policy predicate on the column; the only index is `(consumer, processed_at)` which is unaffected
  timestamp: 2026-06-28

## Resolution

root*cause: `inbox_processed.event_id` was `uuid` but Stripe event ids (`evt*...`) are not UUIDs — every `runDeduped`insert for the payments webhook consumer hit Postgres 22P02 before any side effect ran.
fix: Migration`0056*inbox_event_id_varchar.sql` (`ALTER TABLE inbox_processed ALTER COLUMN event_id TYPE varchar(255)`); schema updated in `packages/db/src/schema/inbox.ts` (`uuid`→`varchar(255)`); regression test added in `apps/api/test/e2e/stripe-webhook-inbox-dedup.e2e.spec.ts`.
verification: db:migrate applied cleanly; column confirmed `character varying(255)`via information_schema; 7 unit tests pass; 2 new e2e tests pass (inbox INSERT with`evt*` id + idempotency); tsc clean on both packages.
files_changed:

- packages/db/migrations/0056_inbox_event_id_varchar.sql
- packages/db/migrations/meta/\_journal.json
- packages/db/src/schema/inbox.ts
- apps/api/test/e2e/stripe-webhook-inbox-dedup.e2e.spec.ts
  commit: 2d96441 (admin-vite-spa)

## Live Verification Note

After api restarts with the migrated schema, re-trigger `account.updated` by touching connected account `acct_1TnERu2Kh1rNoqvM` metadata via Stripe API. The webhook should now 2xx and sync `stripe_charges_enabled=true` for demo tenant `1499eff7-3f68-4385-9e5a-31307b65b6e1`, unblocking `POST /v1/checkout/payment-intent`.

## Phase 8 hardening (#3 card_payments capability, #4 order-status persistence)

### BUG #3 — Express account created without card_payments capability

Root cause: `StripeConnectAdapter.createExpressAccount` called `accounts.create` without a `capabilities` key. For direct charges (charge created on the connected account with the `Stripe-Account` header), the connected account requires `card_payments`; without it Stripe rejects the charge with "You cannot create a charge on a connected account without the card_payments capability enabled."

Fix: Added `capabilities: { card_payments: { requested: true }, transfers: { requested: true } }` to the `accounts.create` params in `apps/api/src/contexts/tenancy/infrastructure/stripe-connect.adapter.ts`. Two new unit tests in `stripe-connect.adapter.spec.ts` assert both capabilities are present in the payload.

### BUG #4 — Order status transitions never persisted (CRITICAL)

Root cause: `OrderDrizzleRepository.save()` is INSERT-only with `onConflictDoNothing` — it is a no-op for any order that already exists. Both transition callers (`requireAction` in checkout, `markPaid` in the webhook handler) called `save()` on an existing order, so the status change was written to the in-memory aggregate but never persisted to Postgres. Orders stayed `'created'` after checkout and never flipped to `'paid'` after a successful charge.

Fix: Added `update(order: Order, tx?: RestoTx): Promise<void>` to the `OrderRepository` port (`apps/api/src/contexts/ordering/domain/ports.ts`). Implemented in `OrderDrizzleRepository` via a private `#runUpdate` helper: UPDATE `orders` SET `status`, `updatedAt`, `scheduledFor` WHERE `id` AND `tenantId`, assert exactly one row updated, then drain and append `pullEvents()` to the outbox (same pattern as `save()`). Both callers rewired:

- `create-checkout-payment.service.ts`: `requireAction` path → `this.orderRepo.update(order)` (no tx, opens its own `withTenant`).
- `handle-stripe-event.service.ts`: `markPaid` path → `this.orderRepo.update(order, tx)` — passes the handler's `runDeduped` transaction so the order UPDATE + outbox append commit atomically with the inbox marker + payment upsert.

New method signature: `update(order: Order, tx?: RestoTx): Promise<void>`

No migration required — `update()` runs a plain UPDATE on existing columns (`status`, `updated_at`, `scheduled_for`).

### Lifecycle e2e test

Added `apps/api/test/e2e/payment-lifecycle.e2e.spec.ts` — 3 steps against real Postgres (testcontainers) with real `OrderDrizzleRepository`, `PaymentDrizzleRepository`, and `runDeduped`:

1. Seed: insert tenant, brand, order (status `'created'`) via `withoutTenant`.
2. Step 2: `CreateCheckoutPaymentService.execute` with stubbed `StripeConnectPort.createPaymentIntent` — asserts order row flips to `'requires_action'` and payment row written (`'requires_action'`). Proves BUG #4 update path + PAY-14 partial-index upsert.
3. Step 3: `HandleStripeEventService.handle` with crafted `payment_intent.succeeded` event (`evt_` id) — asserts order row flips to `'paid'`, payment row to `'succeeded'`, inbox_processed row written (PAY-13), outbox row present, and second delivery is idempotent (inbox still 1 row). Proves BUG #4 `markPaid` persistence + PAY-13 end-to-end.
4. Step 4: `HandleStripeEventService.handle` with crafted `charge.refunded` event — asserts `payment_refunds` row written and `status = 'succeeded'`.

### tsc + test status

- `pnpm --filter api exec tsc --noEmit` — clean.
- `pnpm --filter @resto/db exec tsc --noEmit` — clean.
- `stripe-connect.adapter.spec.ts` — 13 tests passed (2 new capabilities assertions).
- `handle-stripe-event.service.spec.ts` — 7 tests passed.
- `create-checkout-payment.service.spec.ts` — 10 tests passed.
- `stripe-webhook-inbox-dedup.e2e.spec.ts` — 2 tests passed.
- `payments-upsert-partial-index.e2e.spec.ts` — 2 tests passed.
- `payment-lifecycle.e2e.spec.ts` — 3 tests passed.

## Second Root Cause (confirmed) — payments upsert partial-index ON CONFLICT

Postgres error `42P10` (`infer_arbiter_indexes`, plancat.c) on `POST /v1/checkout/payment-intent`. The unique index `payments_payment_intent_id_uq` is PARTIAL (`WHERE payment_intent_id IS NOT NULL`); Drizzle's `onConflictDoUpdate` requires a matching `targetWhere` predicate for Postgres to select the partial index as the ON CONFLICT arbiter. Without it, Postgres cannot resolve the arbiter and errors before the row is inserted.

Fix: `apps/api/src/contexts/payments/infrastructure/payment-drizzle.repository.ts` — added `targetWhere: sql\`payment_intent_id is not null\``to the`onConflictDoUpdate`call in`upsertByPaymentIntentId`; added `sql` to the drizzle-orm import. No migration required (schema unchanged).

Test added: `apps/api/test/e2e/payments-upsert-partial-index.e2e.spec.ts` — 2 tests against testcontainers Postgres via `withTenantId`: insert path (no 42P10) + conflict-update path (`requires_action` → `succeeded`). Both pass.

TypeScript: `pnpm --filter api exec tsc --noEmit` clean. Commit: `546c56e` (admin-vite-spa).

## #5 webhook order lookup ALS bug + e2e fidelity fix

**Root cause:** `runDeduped` runs the handler callback under `db.withoutTenant(...)` — a BYPASSRLS system
transaction with no ALS tenant bound (ADR-0020 I-1). Inside `handlePaymentIntentSucceeded`, the callback called
`this.orderRepo.findById(orderId)`, which internally calls `requireTenantContext()` and reads the ALS store.
With no ALS context bound in the webhook background path, this throws "No tenant context bound" and rolls back
the entire `runDeduped` transaction — order never marked paid, payment never marked succeeded.

The lifecycle e2e (added in the #4 fix) passed despite the real bug because it wrapped every
`handlerService.handle()` call in `runInTenantContext`, which bound an ALS context that `findById` then read.
Production `StripeWebhookController` is `@Public` and is never covered by `TenantContextMiddleware`, so no ALS
is bound there. The e2e was testing a fictional path.

**Fix Part A — `findByIdInTx` on `OrderRepository`:**
Added `findByIdInTx(tx: RestoTx, id: OrderId, tenantId: string): Promise<Order | null>` to the
`OrderRepository` port (`ordering/domain/ports.ts`). Implemented in `OrderDrizzleRepository` as a one-line
delegate to the existing private `loadByIdWithTx(tx, id, tenantId)`, which already explicitly filters both
`eq(orders.id, id)` AND `eq(orders.tenantId, tenantId)` — safe under BYPASSRLS.

In `handle-stripe-event.service.ts` line 170, replaced:

```
const order = await this.orderRepo.findById(orderId as OrderId);
```

with:

```
const order = await this.orderRepo.findByIdInTx(tx, orderId as OrderId, parsedTenantId);
```

using the enclosing `runDeduped` callback `tx` and the already-parsed `parsedTenantId`. A `// ADR-0020 I-6`
comment explains why. No `runInTenantContext` or `db.withTenant` introduced — background code uses the system
tx + explicit tenantId per ADR-0020 I-6. Grep confirmed this was the only `findById` call in the handler.

**Fix Part B — lifecycle e2e now mirrors production webhook path:**
In `payment-lifecycle.e2e.spec.ts`, all three webhook handler calls previously wrapped in
`runInTenantContext({ tenantId }, () => handlerService.handle(...))` were changed to direct
`await handlerService.handle(...)` calls with no context binding, replicating the production
`StripeWebhookController` which binds no tenant ALS. The checkout step at line 148 retains its
`runInTenantContext` wrapper because checkout is an authenticated HTTP endpoint covered by
`TenantContextMiddleware` in production. The `runInTenantContext` import was kept (still used by checkout).

**Red → green proof:**

- RED (Part B only, Part A reverted to `findById`): step 3 fails with:
  ```
  Error: No tenant context bound. Wrap the call in runInTenantContext() or use withoutTenant(reason, op) for system code.
   ❯ OrderDrizzleRepository.findById order-drizzle.repository.ts:155:17
   ❯ handle-stripe-event.service.ts:170:42
   ❯ run-deduped.ts:51:11
  ```
- GREEN (Part A + Part B): all 3 lifecycle steps pass.

**No migration required.** `findByIdInTx` runs a plain SELECT on existing columns.

**Test pass counts (final):**

- `payment-lifecycle.e2e.spec.ts` — 3 passed (RED confirmed before Part A, GREEN after).
- `stripe-webhook-inbox-dedup.e2e.spec.ts` — 2 passed.
- `payments-upsert-partial-index.e2e.spec.ts` — 2 passed.
- `handle-stripe-event.service.spec.ts` — 7 passed.
- `create-checkout-payment.service.spec.ts` — 10 passed.
- `cancel-order.service.spec.ts` — all passed.
- `refund-order.service.spec.ts` — all passed.
- `create-order.service.spec.ts` — all passed.
- Total across all 8 spec files: 50 passed.

**tsc:** `pnpm --filter api exec tsc --noEmit` — clean.

**Commits:** `4be9ddc` (fix) and `3082f4d` (test) on branch `admin-vite-spa`.

## #6 charge.refunded status flip

### Root cause

Two independent paths, both broken:

**(a) PRIMARY — RefundOrderService** (`apps/api/src/contexts/payments/application/refund-order.service.ts`):
Line ~100 passed `status: payment.status` (the existing DB status, always `'succeeded'` at refund time) to `upsertByPaymentIntentId`. The status was never changed regardless of refund amount. Order aggregate `refund()` correctly computed full vs partial, but the payment row was never updated.

**(b) HARDEN — handleRefund webhook** (`handle-stripe-event.service.ts` lines 320-322):

```
const refundData = charge.refunds?.data?.[0];
if (!refundData) { warn 'no refund data — ignoring'; return; }
```

Real `charge.refunded` events do NOT embed `refunds.data` inline — the refunds list is a separate sub-resource not expanded in the webhook payload. This guard always triggered on real events → early return → all logic below (computing `fullyRefunded`, flipping status) never ran. The entire webhook refund path was dead code.

### Fix

**(a)** In `RefundOrderService.executeWithOrder`, added:

```typescript
const newPaymentStatus =
  newRefundedMinor >= capturedMinor ? 'refunded' : 'partially_refunded';
```

And passed `status: newPaymentStatus` (not `payment.status`) to `upsertByPaymentIntentId`.

Both `'refunded'` and `'partially_refunded'` are already in `payments_status_chk` — **no migration required**.

**(b)** In `HandleStripeEventService.handleRefund`, removed the dead `refundData` bail entirely. Re-cast the charge object to read `amount_refunded` (cumulative total refunded, always present on `charge.refunded`) and `amount_captured` (fallback `amount`). Rebuilt the handler to:

- Compute `fullyRefunded = cumulativeRefundedMinor >= capturedMinor`
- SET `refundedAmount` to cumulative value (not increment) — idempotency guarantee
- SET `status` to `'refunded'` or `'partially_refunded'`
- No refund-row insertion — `charge.refunded` carries no stable `stripe_refund_id`; refund-row insertion requires `refund.created`/`refund.updated` (not implemented — logged as PAY-BUG6-GAP)

### Idempotency guarantee

The webhook path uses `cumulativeRefundedMinor = charge.amount_refunded` (Stripe always sends the total refunded to date, not a delta). `upsertByPaymentIntentId` is an `ON CONFLICT DO UPDATE SET ...` — it sets `refunded_amount` and `status` to the cumulative values unconditionally. A refund applied by the sync path (RefundOrderService) and then re-observed by the webhook cannot double-count: the SET overwrites with the same cumulative total. No error; no data change.

### Dashboard-refund-row gap (PAY-BUG6-GAP)

Refund rows in `payment_refunds` keyed by `stripe_refund_id` are inserted by the synchronous `RefundOrderService` path (API-initiated refunds) and can also be inserted by `refund.created` / `refund.updated` webhook events (dashboard-initiated refunds). `charge.refunded` carries no stable `stripe_refund_id`, so it cannot insert a refund row — it only flips the payment status. Dashboard-initiated refunds therefore do not appear in `payment_refunds` unless `refund.created` handling is added. This is logged at INFO level on every `charge.refunded` processing.

### Red → Green proof

**RED** (fix (b) reverted — dead bail restored):

```
FAIL HandleStripeEventService > charge.refunded (BUG-6) > BUG-6 (b): real Stripe shape — no refunds.data — still flips payment status to refunded
AssertionError: expected "spy" to be called at least once
 ❯ handle-stripe-event.service.spec.ts:321:30
    319|       await service.handle(event as never);
    321|       expect(runDedupedMock).toHaveBeenCalled();
                                     ^

FAIL HandleStripeEventService > charge.refunded (BUG-6) > BUG-6 (b): partial charge.refunded flips payment status to partially_refunded
AssertionError: expected "spy" to be called with arguments: [ ObjectContaining{…}, Anything ]
Received: (none) — Number of calls: 0
```

`runDedupedMock` was never called; `upsertByPaymentIntentId` was never called (0 invocations). The dead bail returned before reaching any DB logic.

**GREEN** (fix applied):

- `handle-stripe-event.service.spec.ts` — 10 tests passed (3 new BUG-6 tests)
- `refund-order.service.spec.ts` — 11 tests passed (2 new BUG-6 tests)
- `payment-lifecycle.e2e.spec.ts` step 4 — 1 test passed (real Stripe shape, no `refunds.data`, asserts `status='refunded'` and `refunded_amount='15.00'` in Postgres)

### Files changed

- `apps/api/src/contexts/payments/application/refund-order.service.ts` — fix (a): compute `newPaymentStatus`
- `apps/api/src/contexts/payments/application/handle-stripe-event.service.ts` — fix (b): remove dead bail, use `amount_refunded`/`amount_captured`
- `apps/api/src/contexts/payments/application/refund-order.service.spec.ts` — 2 new BUG-6(a) assertions
- `apps/api/src/contexts/payments/application/handle-stripe-event.service.spec.ts` — 3 new BUG-6(b) assertions (real shape, partial, backward compat)
- `apps/api/test/e2e/payment-lifecycle.e2e.spec.ts` — step 4 updated: real Stripe shape (no `refunds.data`), asserts payment status flip in Postgres

## Money-path test-fidelity audit

Scope: all spec files covering payments context, ordering repo/services, and e2e touching `/webhook/stripe`, `/v1/checkout`, `/v1/orders`.

| Spec                                             | Classification       | Masked risk                                                                                                                                                                                                                                                                                                                           | Real bug (y/n)                                                                                                                                                    |
| ------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handle-stripe-event.service.spec.ts`            | OVER-BOUND (pre-fix) | Mocks `runDeduped` — real DB inbox INSERT never exercised; fed `refunds.data` inline on charge.refunded tests (false-green on dead-bail path)                                                                                                                                                                                         | y — BUG #1 (uuid inbox, hid by mocked runDeduped); BUG #6 (dead bail, hid by inline refunds.data). Both now fixed and test updated.                               |
| `refund-order.service.spec.ts`                   | OVER-BOUND (pre-fix) | Asserted `orderRepo.save` order status but never checked `status` field passed to `upsertByPaymentIntentId` — allowed `payment.status` passthrough to go undetected                                                                                                                                                                   | y — BUG #6(a). Fixed: 2 new assertions added.                                                                                                                     |
| `create-checkout-payment.service.spec.ts`        | FAITHFUL             | Mocks repo/stripe (correct for unit) — checkout runs under `runInTenantContext` in production via middleware; test uses `db.withTenant` mock which is the right shape for the service's internal call. No ALS binding at test level (correct — service binds via `db.withTenant` internally, not via `runInTenantContext` in caller). | n                                                                                                                                                                 |
| `cancel-order.service.spec.ts`                   | FAITHFUL             | Mocks repo/stripe at correct level — `CancelOrderService` calls `RefundOrderService.executeWithOrder` synchronously with the order; test matches this shape.                                                                                                                                                                          | n                                                                                                                                                                 |
| `stripe-connect.adapter.spec.ts`                 | FAITHFUL             | Uses real Stripe SDK with mocked HTTP (`vi.fn()` on stripe methods) — matches production call shape. Capability assertions guard against BUG #3 regression.                                                                                                                                                                           | n                                                                                                                                                                 |
| `stripe-webhook.controller.spec.ts`              | FAITHFUL             | Uses real `Stripe.webhooks.generateTestHeaderString` for signature; delegates to mocked `HandleStripeEventService.handle`. Controller layer only — correct boundary. Binds no tenant ALS (controller is `@Public`, which is correct).                                                                                                 | n                                                                                                                                                                 |
| `test/unit/create-order.service.spec.ts`         | FAITHFUL             | Unit test of `CreateOrderService` — mocks repo/catalog; tests server-authoritative pricing logic. No money path involved.                                                                                                                                                                                                             | n                                                                                                                                                                 |
| `stripe-webhook-inbox-dedup.e2e.spec.ts`         | FAITHFUL             | Real Postgres (testcontainers) + real `runDeduped` + real `HandleStripeEventService`; no ALS binding (correct — `account.updated` path reads accountId from event, not ALS); uses real `evt_` id format.                                                                                                                              | n                                                                                                                                                                 |
| `payments-upsert-partial-index.e2e.spec.ts`      | FAITHFUL             | Real Postgres + real `PaymentDrizzleRepository.upsertByPaymentIntentId`; uses `db.withTenantId` (correct for non-HTTP test context). Tests the `ON CONFLICT … targetWhere` arbiter.                                                                                                                                                   | n                                                                                                                                                                 |
| `payment-lifecycle.e2e.spec.ts` steps 2–3        | FAITHFUL             | Real Postgres + real repos + real `runDeduped`; step 2 (checkout) correctly wraps in `runInTenantContext` (checkout is authenticated HTTP path with middleware); step 3 (webhook) calls handler with no ALS binding (mirrors production `StripeWebhookController @Public`).                                                           | n                                                                                                                                                                 |
| `payment-lifecycle.e2e.spec.ts` step 4 (pre-fix) | OVER-BOUND           | Fed `refunds.data` inline — exercised dead-bail path that returned early without reaching any DB logic. Asserted `payment_refunds` row insertion that never actually ran.                                                                                                                                                             | y — BUG #6. Fixed: step 4 now feeds real Stripe shape (`amount_refunded`/`amount_captured`, no `refunds.data`), asserts `payments.status='refunded'` in Postgres. |

### Summary

- 3 OVER-BOUND findings, all tied to BUG #6 — all corrected by the fix and accompanying test updates.
- No additional NEW REAL BUGs surfaced during the audit. Making each OVER-BOUND test faithful produced GREEN results against the fixed production code (no hidden defects in the remaining over-bound paths once the fix is applied).

### tsc + test pass counts (post-fix)

- `pnpm --filter api exec tsc --noEmit` — clean.
- `handle-stripe-event.service.spec.ts` — 10 passed (3 new).
- `refund-order.service.spec.ts` — 11 passed (2 new).
- `create-checkout-payment.service.spec.ts` — 10 passed.
- `cancel-order.service.spec.ts` — 4 passed.
- `stripe-connect.adapter.spec.ts` — 13 passed.
- `stripe-webhook.controller.spec.ts` — 5 passed.
- `test/unit/create-order.service.spec.ts` — 13 passed.
- `stripe-webhook-inbox-dedup.e2e.spec.ts` — 2 passed.
- `payments-upsert-partial-index.e2e.spec.ts` — 2 passed.
- `payment-lifecycle.e2e.spec.ts` — 3 passed (step 4 updated).
