# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## stripe-webhook-inbox-uuid — inbox*processed.event_id uuid rejects Stripe evt* dedup keys

- **Date:** 2026-06-28
- **Error patterns:** 22P02, string_to_uuid, inbox_processed, event_id, uuid, stripe-webhook, runDeduped, 500, payments-webhook
- **Root cause:** `inbox_processed.event_id` was typed `uuid` but Stripe event ids (`evt_...`) are not UUIDs — every `runDeduped` INSERT for the payments webhook consumer hit Postgres 22P02 before any side effect ran.
- **Fix:** Migration `0056_inbox_event_id_varchar.sql` (`ALTER TABLE inbox_processed ALTER COLUMN event_id TYPE varchar(255)`); schema updated `uuid('event_id')` → `varchar('event_id', { length: 255 })` in `packages/db/src/schema/inbox.ts`.
- **Files changed:** packages/db/migrations/0056_inbox_event_id_varchar.sql, packages/db/migrations/meta/\_journal.json, packages/db/src/schema/inbox.ts, apps/api/test/e2e/stripe-webhook-inbox-dedup.e2e.spec.ts

---
