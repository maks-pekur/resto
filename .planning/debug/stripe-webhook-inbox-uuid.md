---
slug: stripe-webhook-inbox-uuid
status: investigating
created: 2026-06-28
trigger: Phase 8 payments webhook fully broken at runtime — every Stripe webhook POST to /webhook/stripe returns 500 because inbox_processed.event_id is typed uuid but the payments consumer passes a Stripe event id (evt_...), which is not a UUID.
phase_context: 08-payments-stripe-connect (continuation; branch admin-vite-spa)
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
- timestamp: 2026-06-28 — `handle-stripe-event.service.spec.ts` MOCKS `runDeduped` (`runDedupedMock`), so the uuid-typed insert is never exercised by the only handler test. No e2e posts to `/webhook/stripe` against a real DB (grep of `apps/api/test/e2e` finds none). This is the test gap that hid the bug.

## Root Cause (confirmed)

`inbox_processed.event_id` is typed `uuid`, but the payments webhook consumer legitimately uses the Stripe event id (`evt_...`, not a UUID) as the dedup key. The dedup INSERT therefore fails with Postgres `22P02` for every Stripe webhook, 500ing the handler before any side effect. The inbox dedup ledger is a generic at-most-once table whose key should be any opaque string, not specifically a UUID — constraining it to `uuid` was an over-specification that the Phase 8 Stripe integration violated.

## Agreed Fix (user-approved)

Change `inbox_processed.event_id` from `uuid` to `varchar(255)`:

- New migration in `packages/db/migrations/`: `ALTER TABLE inbox_processed ALTER COLUMN event_id TYPE varchar(255);` (existing uuid values cast cleanly to text; PK (event_id, consumer) is preserved across the type change). Verify no RLS policy / FK depends on the column type.
- `packages/db/src/schema/inbox.ts`: `uuid('event_id')` → `varchar('event_id', { length: 255 })` (import `varchar` from drizzle-orm/pg-core).
- Regression net: add an e2e that POSTs a real Stripe-shaped event (non-uuid `evt_` id) to `/webhook/stripe` against the real testcontainers stack and asserts the inbox insert + the side effect both succeed (this is what the mocked unit test failed to cover).

Constraints: NO code comments except critical-WHY; conventional-commit single-line subject, no body, no Claude attribution. Run migrations via `pnpm --filter @resto/db db:migrate`. After the fix, re-trigger `account.updated` (touch connected-account metadata) so the live smoke can resume.

## Current Focus

- hypothesis: `inbox_processed.event_id` uuid type rejects the Stripe `evt_` dedup key → 22P02 → webhook 500 (confirmed above).
- next_action: verify root cause (no other dependents on the column type), implement the agreed varchar(255) migration + schema change, add the regression e2e, run db:migrate + e2e, then confirm a live `account.updated` syncs `stripe_charges_enabled=true`.
