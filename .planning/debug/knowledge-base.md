# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## offboard-cancel-403 — scheduling offboarding stamps archivedAt, which locks the owner out of cancelling

- **Date:** 2026-08-28
- **Error patterns:** 403, tenant.archived, archivedAt, offboarding, cool-off, AuthGuard, DELETE /v1/tenants/me/offboard, cancelOffboarding, pending_offboarding
- **Root cause:** `Tenant.scheduleOffboarding` stamps `archivedAt` alongside `status='pending_offboarding'`, and `AuthGuard` refuses every non-public request whose tenant has `archivedAt` set (403 `tenant.archived`). The owner-facing cancel route therefore became unreachable the instant it became relevant — the 30-day GDPR cool-off could not be exercised by the person it exists for. Support could still cancel via the `@Public` + `InternalTokenGuard` internal route.
- **Fix:** New `@AllowArchivedTenant()` decorator; `AuthGuard` skips only the `archivedAt` refusal for routes carrying it (never for public routes); applied solely to `DELETE /v1/tenants/me/offboard`. Founder chose "go dark immediately, keep the way back" over making the cool-off fully reversible.
- **Files changed:** apps/api/src/shared/auth/allow-archived-tenant.decorator.ts, apps/api/src/shared/auth/index.ts, apps/api/src/contexts/identity/interfaces/http/guards/auth.guard.ts, apps/api/src/contexts/tenancy/interfaces/http/tenants.controller.ts, apps/api/test/e2e/tenants-controller.e2e.spec.ts
- **Lesson:** The prior audit had eliminated its way to "must be the guard's own auth.forbidden" and was wrong — the body said `tenant.archived`. With an HTTP symptom, capture the response body before reasoning about the cause.

---

## stripe-webhook-inbox-uuid — inbox*processed.event_id uuid rejects Stripe evt* dedup keys

- **Date:** 2026-06-28
- **Error patterns:** 22P02, string_to_uuid, inbox_processed, event_id, uuid, stripe-webhook, runDeduped, 500, payments-webhook
- **Root cause:** `inbox_processed.event_id` was typed `uuid` but Stripe event ids (`evt_...`) are not UUIDs — every `runDeduped` INSERT for the payments webhook consumer hit Postgres 22P02 before any side effect ran.
- **Fix:** Migration `0056_inbox_event_id_varchar.sql` (`ALTER TABLE inbox_processed ALTER COLUMN event_id TYPE varchar(255)`); schema updated `uuid('event_id')` → `varchar('event_id', { length: 255 })` in `packages/db/src/schema/inbox.ts`.
- **Files changed:** packages/db/migrations/0056_inbox_event_id_varchar.sql, packages/db/migrations/meta/\_journal.json, packages/db/src/schema/inbox.ts, apps/api/test/e2e/stripe-webhook-inbox-dedup.e2e.spec.ts

---
