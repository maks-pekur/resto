---
phase: 08-payments-stripe-connect
plan: '06'
subsystem: notifications
tags: [notifications, email, gnotif, nats, brand-theme, idempotency, dlq]
dependency_graph:
  requires: [08-01, 08-03]
  provides: [GNOTIF-01, GNOTIF-02, GNOTIF-03, GNOTIF-04]
  affects: [payments-context, ordering-context, identity-email-adapter]
tech_stack:
  added: []
  patterns:
    - notifications context (domain/application/infrastructure)
    - brand-themed HTML email templates with per-locale strings (en + ru)
    - send-once idempotency key per (orderId, transition)
    - NATS subscriber with explicit max_deliver=5 + dlqPublisher (B4/AUTH-10)
    - NotificationOrderDrizzleRepository (ADR-0020 I-1 compliant)
key_files:
  created:
    - apps/api/src/contexts/notifications/domain/ports.ts
    - apps/api/src/contexts/notifications/application/send-guest-notification.service.ts
    - apps/api/src/contexts/notifications/application/send-guest-notification.service.spec.ts
    - apps/api/src/contexts/notifications/infrastructure/guest-email-templates.ts
    - apps/api/src/contexts/notifications/infrastructure/guest-email-templates.spec.ts
    - apps/api/src/contexts/notifications/infrastructure/nats-guest-notification.subscriber.ts
    - apps/api/src/contexts/notifications/infrastructure/nats-guest-notification.subscriber.spec.ts
    - apps/api/src/contexts/notifications/infrastructure/notification-order-drizzle.repository.ts
    - apps/api/src/contexts/notifications/notifications.module.ts
  modified:
    - apps/api/src/contexts/identity/domain/ports.ts
    - apps/api/src/contexts/identity/infrastructure/email/resend.adapter.ts
    - apps/api/src/contexts/identity/infrastructure/email/captured.adapter.ts
    - apps/api/src/contexts/identity/infrastructure/email/mailhog-smtp.adapter.ts
    - apps/api/src/app.module.ts
    - apps/api/src/infrastructure/nats.module.ts
decisions:
  - locale is hardcoded to 'ru' in the service because brand.locale is not on BrandSnapshot; a fast-follow can read it from the tenant/brand DB row when Phase 10 adds locale to the schema
  - GNOTIF-02 (order_accepted + order_ready) subscriber and templates ship in Phase 8 but produce no emails until Phase 10 operator transitions emit ordering.order_status_changed.v1
  - NotificationOrderDrizzleRepository created to satisfy ADR-0020 I-1 (no direct tx.select in application service)
  - BRAND_REPOSITORY not exported from TenancyModule — used BrandQueriesService.listForTenant instead
metrics:
  duration_minutes: 90
  completed_at: '2026-06-27T14:23:53Z'
  tasks_completed: 2
  tasks_total: 2
  files_created: 9
  files_modified: 6
---

# Phase 8 Plan 06: Guest Notification Emails (GNOTIF) Summary

Brand-themed, per-locale guest notification emails over the existing Resend transport. GNOTIF-01 (order confirmation) and GNOTIF-03 (refund) fire from Phase-8 payment events. GNOTIF-02 (accepted/ready) machinery ships dormant until Phase-10 operator transitions emit the trigger event.

## What Was Built

**Task 1 — EmailAdapterPort.sendGuestNotification + brand-themed templates**

- Added `SendGuestNotificationInput`, `GuestNotificationKind`, `GuestBrandTheme`, `GuestEmailVars` types to `identity/domain/ports.ts` (where the port lives).
- Added `sendGuestNotification()` to the `EmailAdapterPort` interface — implemented in all three adapters: `ResendEmailAdapter` (routes through `#sendWithRetry` with `html` field + idempotencyKey), `MailhogSmtpAdapter` (sends HTML via nodemailer), `CapturedEmailAdapter` (records as `{ kind: 'guest-notification', input }` for test assertions).
- Created `notifications/infrastructure/guest-email-templates.ts`: `renderGuestEmail(kind, locale, brandTheme, brandName, vars)` produces `{ subject, html, text }`. Brand theme values are sanitized — `accentColor` constrained to `/^#[0-9A-Fa-f]{6}$/`, `logoUrl` to `https://` only (T-08-26).
- En + ru strings for all four kinds: `order_confirmation`, `order_refunded`, `order_accepted`, `order_ready`.
- Extended `ResendClientLike.send` payload to accept optional `html` field.

**Task 2 — notifications context (subscriber + service)**

- `notifications/infrastructure/notification-order-drizzle.repository.ts`: ADR-0020 I-1-compliant repository for order + order-item reads using `db.withTenantId`.
- `notifications/application/send-guest-notification.service.ts`: loads order via repository, skips gracefully when `customerEmail` is null/missing (log warn, no throw), resolves brand theme via `BrandQueriesService`, builds deterministic idempotency key `gnotif:<orderId>:<transition>` (D-10/D-13 external-effect guard), calls `EmailAdapterPort.sendGuestNotification`.
- `notifications/infrastructure/nats-guest-notification.subscriber.ts`: subscribes to `payments.>` (GNOTIF-01/03) and `ordering.order_status_changed.v1` (GNOTIF-02). Each subscription passes `maxDeliver: 5`, `ackWaitMs: 30_000`, `maxInFlight: 1`, and the injected `dlqPublisher` (B4/AUTH-10). Handlers call `runDeduped` for inbox-level dedup, then dispatch to the service.
- `notifications/notifications.module.ts`: imports `TenancyModule` + `IdentityCoreModule`; re-uses `EMAIL_ADAPTER_PORT` exported by `IdentityCoreModule`.
- Added `payments.>` subject to `NATS_STREAM_SUBJECTS` in `nats.module.ts` (was missing).
- Registered `NotificationsModule` in `app.module.ts`.

## GNOTIF-02 Cross-Phase Note

`ordering.order_status_changed.v1` for `newStatus = 'accepted'` and `newStatus = 'ready'` is emitted by Phase-10 operator transition services (`accept()` / `markReady()` on the Order aggregate). The subscriber + templates exist and are live in Phase 8 — they produce no emails until Phase 10 wires the operator transitions.

## Test Results

```
Test Files  64 passed (64)
Tests       477 passed (477)
```

Key specs:

- `guest-email-templates.spec.ts` (11 tests): accent color injected, null theme → neutral default, refund amount shown, malformed accentColor/logoUrl sanitized, HTML entities escaped.
- `send-guest-notification.service.spec.ts` (7 tests): GNOTIF-01/03/02 fire correctly, idempotency key format, brand theme applied, missing email skips gracefully, missing order skips gracefully.
- `nats-guest-notification.subscriber.spec.ts` (10 tests): explicit `maxDeliver` + `dlqPublisher` on all subscriptions, correct subjects, GNOTIF-01/02/03 routing, unhandled statuses ignored, shutdown stops subscriptions.

## Deviations from Plan

### Auto-added

**1. [Rule 2 - Missing] NotificationOrderDrizzleRepository**

- **Found during:** Task 2 commit (ESLint ADR-0020 I-1 rule)
- **Issue:** Direct `tx.select()` in an application service violates the project-wide lint rule requiring DB queries in `*-drizzle.repository.ts` files.
- **Fix:** Extracted order and order-item queries to `notification-order-drizzle.repository.ts`; service now injects `NOTIFICATION_ORDER_REPOSITORY`.
- **Files modified:** `send-guest-notification.service.ts`, new `notification-order-drizzle.repository.ts`, `notifications.module.ts`

**2. [Rule 3 - Blocking] payments.> subject missing from NATS stream**

- **Found during:** Task 2 implementation review
- **Issue:** `nats.module.ts` `STREAM_SUBJECTS` array did not include `payments.>`, meaning the notifications subscriber could never receive payment events.
- **Fix:** Added `'payments.>'` to the stream subjects list.
- **Files modified:** `apps/api/src/infrastructure/nats.module.ts`

**3. [Rule 3 - Blocking] BRAND_REPOSITORY not exported from TenancyModule**

- **Found during:** Task 2
- **Issue:** Plan called for using `BRAND_REPOSITORY` but it is not in `TenancyModule.exports`.
- **Fix:** Used `BrandQueriesService.listForTenant(tenantId, [brandId])` instead, which IS exported.
- **Files modified:** `send-guest-notification.service.ts`

### Known Limitations

- **Locale hardcoded to 'ru'**: `BrandSnapshot` does not carry a `locale` field. The service defaults to `'ru'` for all brands. A fast-follow in Phase 10 (when brand locale is added to schema) can read it from the DB.

## Threat Surface Scan

No new network endpoints introduced. Email send surface existed before (Resend adapter). The brand theme values (accentColor, logoUrl) that flow into HTML are sanitized in `guest-email-templates.ts` (T-08-26).

## Self-Check

- `apps/api/src/contexts/notifications/infrastructure/guest-email-templates.ts` — exists ✓
- `apps/api/src/contexts/notifications/infrastructure/nats-guest-notification.subscriber.ts` — exists ✓
- `apps/api/src/contexts/notifications/application/send-guest-notification.service.ts` — exists ✓
- `apps/api/src/contexts/notifications/notifications.module.ts` — exists ✓
- Task 1 commit `5d486a7` — exists ✓
- Task 2 commit `4b81a6a` — exists ✓

## Self-Check: PASSED
