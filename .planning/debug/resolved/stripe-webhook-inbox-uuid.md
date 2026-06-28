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
