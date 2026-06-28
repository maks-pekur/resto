---
phase: 08-payments-stripe-connect
verified: 2026-06-27T21:21:54Z
status: gaps_found
score: 4/5
overrides_applied: 0
gaps:
  - truth: 'Stripe webhook idempotent; double-charge orphan guard auto-refunds; webhook handler is safe'
    status: partial
    reason: |
      The D-06 orphan auto-refund path (handle-stripe-event.service.ts:198) writes a payment row
      with status 'orphan', but 'orphan' is NOT in the payments_status_chk DB CHECK constraint
      (0055 migration: only 'pending','requires_action','succeeded','failed','refunded',
      'partially_refunded' are allowed). The DB will reject the INSERT/UPDATE with a constraint
      violation, causing (a) the refund call to be skipped, (b) the webhook handler to return
      an error, and (c) Stripe to keep retrying — all retries also fail. Result: a duplicate
      charge from an orphan late-succeeding PI is never refunded.
    artifacts:
      - path: 'apps/api/src/contexts/payments/application/handle-stripe-event.service.ts'
        issue: "Line 198: status: 'orphan' violates payments_status_chk CHECK constraint"
      - path: 'packages/db/migrations/0055_payments_money_path.sql'
        issue: "Line 22-23: CHECK constraint does not include 'orphan'"
      - path: 'packages/db/src/schema/ordering.ts'
        issue: "Line 163: Drizzle schema check does not include 'orphan'"
    missing:
      - "Add 'orphan' to payments_status_chk CHECK in migration and Drizzle schema (new migration 0056)"
      - 'OR: skip the DB write for orphan rows and just call createRefund directly with a deterministic key'
human_verification:
  - test: 'Admin onboarding click-through (PAY-02/03)'
    expected: 'Connect Stripe button visible, click redirects to Stripe hosted onboarding flow, account_link URL returned'
    why_human: 'Requires real Stripe test keys, running dev stack, and a browser to complete the redirect'
  - test: 'End-to-end payment success path (PAY-06/07, SITE-08)'
    expected: "Guest pays with 4242 4242 4242 4242, confirmation page shows 'Confirming...' then flips to paid after webhook"
    why_human: 'Requires Stripe CLI, real test-mode keys, and live webhook forwarding'
  - test: 'SCA/3DS path (D-08)'
    expected: 'Card 4000 0027 6000 3184 triggers 3DS challenge; after completion, order reaches paid'
    why_human: 'Requires Stripe CLI and browser to complete the 3DS challenge UI'
  - test: 'Refund smoke (PAY-09)'
    expected: 'POST /v1/orders/:id/refund (owner session, reason required) creates Stripe refund, order flips to refunded'
    why_human: 'Requires a real paid Stripe test order and owner session'
  - test: 'Guest email delivery (GNOTIF-01/03)'
    expected: 'After payment success, guest at orders.customer_email receives order confirmation email from the brand'
    why_human: 'Requires end-to-end mail flow with Resend or MailHog; cannot be verified by grep'
  - test: 'canAcceptPayments KYC gate (PAY-13)'
    expected: 'Checkout on a non-onboarded tenant returns 409 with paymentsNotEnabled; admin remains fully functional'
    why_human: 'Requires live test of checkout against a tenant without charges_enabled'
---

# Phase 8: Payments (Stripe Connect) — Verification Report

**Phase Goal:** Replace `NoopStripeConnectAdapter` with a real Stripe Connect Express implementation — account onboarding, payment intent routing, webhook handling, refund flow, pending-KYC UX state, outbox leader health probe, order confirmation page, and guest notification emails
**Verified:** 2026-06-27T21:21:54Z
**Status:** gaps_found (1 code blocker; 6 items pending live founder verification)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (5 Success Criteria)

| #    | Truth                                                                                                                                                        | Status                        | Evidence                                                                                                                                                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-1 | Operator initiates Stripe Connect onboarding from admin; `account.updated` updates tenant capability; KYC in progress does not block catalog/admin           | VERIFIED (code)               | `StartStripeOnboardingService` + `StripeOnboardingController` (POST /v1/tenancy/stripe-onboarding); `applyStripeCapabilities()` called from webhook handler; `canAcceptPayments()` gated only at checkout — not at catalog routes. Pending founder live smoke.                                                                   |
| SC-2 | PaymentIntent created as direct charge on tenant account; `payment_intent.succeeded` → order `paid`; guest redirected to SITE-08 confirmation                | VERIFIED (code)               | `createPaymentIntent` uses `stripeAccount` option (no `transfer_data.destination`); webhook handler calls `order.markPaid()`; confirmation page at `/checkout/confirmation/[orderId]` with `OrderStatusPoller`. Pending founder live smoke.                                                                                      |
| SC-3 | `payment_intent.payment_failed` surfaces failure with retry CTA; operator refund creates Stripe refund; order → `refunded`                                   | VERIFIED (code) + PARTIAL GAP | `PaymentOrderFailedV1` emitted → website retry via same orderId; `RefundOrderService` (full+partial); `RefundExceedsCapturedError` invariant. GAP: orphan D-06 auto-refund write to DB violates `payments_status_chk`.                                                                                                           |
| SC-4 | Guest receives emails on payment success, accepted, ready, refund; templates respect brand theme                                                             | VERIFIED (code) — WARNING     | GNOTIF-01 (confirmation) + GNOTIF-03 (refund) fire from Phase-8 events; GNOTIF-02 (accepted/ready) wired dormant, fires when Phase-10 emits `ordering.order_status_changed.v1`. Brand `logoUrl` flows correctly. WARNING: `BrandTheme.primaryColor` ≠ `GuestBrandTheme.accentColor` — accent color always defaults to `#1a1a1a`. |
| SC-5 | Webhook idempotent (inbox dedup); 400 on invalid signature; `StripeAccountId.max(255)`; `outbox.is_leader` gauge; /readyz NOT ready when leader stalled >30s | VERIFIED (code)               | `runDeduped` on `event.id`; `constructEvent` throws → 400; `StripeAccountId = z.string().min(1).max(255)` in `tenant.aggregate.ts`; `createObservableGauge('outbox.is_leader')`; backlog-aware `/readyz` with 30s threshold.                                                                                                     |

**Score:** 4/5 SC truths verified in code. SC-3 is PARTIAL due to the orphan-status DB constraint gap.

---

## Requirements Coverage (18 requirements)

| Req       | Description                                                                                                 | Code Evidence                                                                                                                                                   | Status                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| PAY-01    | Stripe SDK installed; StripeConnectAdapter implements StripeConnectPort                                     | `stripe@17.7.0` in api/package.json; adapter in `tenancy/infrastructure/stripe-connect.adapter.ts`                                                              | VERIFIED                                                         |
| PAY-02    | Operator can initiate Stripe Connect onboarding from admin                                                  | `POST /v1/tenancy/stripe-onboarding`; `StartStripeOnboardingService`                                                                                            | VERIFIED (code; founder smoke pending)                           |
| PAY-03    | `account_link` generated; operator redirected to Stripe hosted onboarding                                   | `createAccountLink()` in adapter; controller returns `{ onboardingUrl }`                                                                                        | VERIFIED (code; founder smoke pending)                           |
| PAY-04    | Webhook validates Stripe signature; rejects invalid with 400                                                | `Stripe.webhooks.constructEvent` + `BadRequestException` in `stripe-webhook.controller.ts`                                                                      | VERIFIED                                                         |
| PAY-05    | `account.updated` webhook updates `tenant.stripe_account_id` and onboarding status                          | `handleAccountUpdated()` → `applyStripeCapabilities()` → `tenantRepo.save()` in `handle-stripe-event.service.ts`                                                | VERIFIED                                                         |
| PAY-06    | PaymentIntent as DIRECT charge via `stripeAccount` option; `application_fee_amount` from config (default 0) | `stripeAccount: input.connectedAccountId` in adapter (no `transfer_data.destination`); `applicationFeeMinor` from env default 0                                 | VERIFIED                                                         |
| PAY-07    | `payment_intent.succeeded` transitions order to `paid`                                                      | `handlePaymentIntentSucceeded()` → `order.markPaid()` → `appendToOutbox(PaymentOrderSucceededV1)`                                                               | VERIFIED                                                         |
| PAY-08    | `payment_intent.payment_failed` surfaces failure to guest with retry CTA                                    | `handlePaymentIntentFailed()` → `PaymentOrderFailedV1` outbox; website `payment.stage === 'error'` shows "Try again" button that retries on same orderId        | VERIFIED (code; founder smoke pending)                           |
| PAY-09    | Refund flow: full+partial; order → `refunded`                                                               | `RefundOrderService.execute()` with `Order.refund(amount, alreadyRefunded)` domain invariant; `POST /v1/orders/:id/refund`; `CancelOrderService` auto-refund    | VERIFIED (code; founder smoke pending)                           |
| PAY-10    | Webhook handler idempotent (inbox dedup with Stripe event id)                                               | `runDeduped(this.db, pseudoEnvelope, CONSUMER_NAME, ...)` where `pseudoEnvelope.id = event.id`                                                                  | VERIFIED                                                         |
| PAY-11    | `stripeAccountId` Zod schema has `.max(255)`                                                                | `StripeAccountId = z.string().min(1).max(255)` exported from `tenant.aggregate.ts`; `safeParse` called in `handleAccountUpdated()`                              | VERIFIED                                                         |
| PAY-12    | `outbox.is_leader` OTel gauge (1/0); /readyz NOT ready when leader stalled >30s; false-negative fix         | `createObservableGauge('outbox.is_leader')` + `addCallback`; backlog-aware `checkOutboxLeader()`; `lastDispatchAt` seeded at lock acquisition; default 30_000ms | VERIFIED                                                         |
| PAY-13    | Operator can use catalog/admin while KYC pending; only payments gated                                       | `canAcceptPayments()` checked only in `CreateCheckoutPaymentService` (not in catalog routes); admin payouts page shows KYC status                               | VERIFIED                                                         |
| SITE-08   | Guest sees order confirmation page after payment success                                                    | `/checkout/confirmation/[orderId]/page.tsx` RSC shell + `OrderStatusPoller` client; polls GET /v1/orders/:id/status until `paid`                                | VERIFIED (code; founder smoke pending)                           |
| GNOTIF-01 | Guest receives confirmation email immediately after payment success                                         | `NatsGuestNotificationSubscriber` on `payments.>` → `SendGuestNotificationService` with `transition: 'order_confirmation'`; fired on `PaymentOrderSucceededV1`  | VERIFIED (code; end-to-end email delivery pending founder smoke) |
| GNOTIF-02 | Guest receives emails on `accepted` and `ready`/`on-its-way` transitions                                    | Subscriber on `ordering.order_status_changed.v1` dispatches `order_accepted`/`order_ready` — machinery wired, fires when Phase-10 emits the event               | VERIFIED (intentionally dormant; Phase-10 deferred per D-13)     |
| GNOTIF-03 | Guest receives refund confirmation email                                                                    | `RefundOrderService` appends `PaymentOrderRefundedV1` → subscriber dispatches `order_refunded` notification                                                     | VERIFIED (code)                                                  |
| GNOTIF-04 | Email templates respect tenant brand theme (logo, accent color)                                             | Templates use `brandTheme?.logoUrl` (VERIFIED) and `brandTheme?.accentColor` (WARNING — see gap below)                                                          | PARTIAL — logo works, accent color always defaults               |

---

## Required Artifacts

| Artifact                                                                        | Expected                             | Status             | Details                                                                                      |
| ------------------------------------------------------------------------------- | ------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------- |
| `packages/db/migrations/0055_payments_money_path.sql`                           | DB schema redesign                   | VERIFIED           | Exists; payments redesign, payment_refunds, orders.customer_email, tenant capability columns |
| `apps/api/src/contexts/tenancy/infrastructure/stripe-connect.adapter.ts`        | Real Stripe Connect adapter          | VERIFIED           | Direct-charge PI, idempotency keys, retry/timeout pattern                                    |
| `apps/api/src/contexts/tenancy/interfaces/http/stripe-onboarding.controller.ts` | POST /v1/tenancy/stripe-onboarding   | VERIFIED           | Owner-only via `tenant:transfer` permission                                                  |
| `apps/api/src/contexts/payments/interfaces/http/stripe-webhook.controller.ts`   | Webhook with raw-body + signature    | VERIFIED           | Raw-body via Fastify content-type parser; constructEvent + 400 on fail                       |
| `apps/api/src/contexts/payments/application/handle-stripe-event.service.ts`     | Webhook event handlers               | VERIFIED (PARTIAL) | All 5 event types handled; D-06 orphan path has DB constraint gap                            |
| `apps/api/src/contexts/payments/application/create-checkout-payment.service.ts` | Server-gated checkout PI             | VERIFIED           | canAcceptPayments gate, cancel-prior-PI, SCA requires_action, currency guard                 |
| `apps/api/src/contexts/payments/interfaces/http/checkout.controller.ts`         | POST /v1/checkout/payment-intent     | VERIFIED           | `@Public` + `@RequireActiveTenant`                                                           |
| `apps/api/src/contexts/payments/application/refund-order.service.ts`            | Full+partial refund, reason required | VERIFIED           | `RefundExceedsCapturedError` invariant; deterministic idempotency key                        |
| `apps/api/src/contexts/payments/application/cancel-order.service.ts`            | Auto-refund on cancel of paid order  | VERIFIED           | `executeWithOrder` before `order.cancel()` — correct ordering                                |
| `apps/api/src/contexts/payments/interfaces/http/refunds.controller.ts`          | POST /v1/orders/:id/refund           | VERIFIED           | `billing:update` (owner-only) permission gate                                                |
| `apps/api/src/contexts/notifications/` (full context)                           | GNOTIF notifications context         | VERIFIED           | Domain ports, service, templates, NATS subscriber, module                                    |
| `apps/website/components/checkout/payment-element.tsx`                          | Stripe Payment Element (SITE-08)     | VERIFIED           | `loadStripe(pk, { stripeAccount: id })` per-PI for direct charges                            |
| `apps/website/components/checkout/order-status-poller.tsx`                      | Status poller                        | VERIFIED           | Poll with backoff [1,2,3,5,10]s until terminal status                                        |
| `apps/website/app/checkout/confirmation/[orderId]/page.tsx`                     | SITE-08 confirmation page            | VERIFIED           | RSC shell + client poller                                                                    |
| `apps/api/src/infrastructure/outbox-dispatcher.service.ts`                      | OTel gauge + false-negative fix      | VERIFIED           | `outbox.is_leader` gauge, acquisition-time seed, backlog-aware probe                         |

---

## Key Link Verification

| From                             | To                                 | Via                                           | Status   | Details                                                                     |
| -------------------------------- | ---------------------------------- | --------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| `PaymentElement`                 | `POST /v1/checkout/payment-intent` | `createPaymentIntent()` in checkout-api.ts    | VERIFIED | `window.location.host` passed as header for tenant resolution               |
| `checkout-form.tsx`              | `POST /v1/orders`                  | `createOrder()` with `customerEmail`          | VERIFIED | `customerEmail` in `CreateOrderInputSchema` and service wiring              |
| Stripe webhook                   | `order.markPaid()`                 | `handlePaymentIntentSucceeded` + `runDeduped` | VERIFIED | Metadata `orderId/tenantId` from PI routes the event                        |
| `payment_intent.succeeded` event | `SendGuestNotificationService`     | NATS `payments.>` → subscriber                | VERIFIED | `payments.>` added to NATS_STREAM_SUBJECTS                                  |
| `RefundOrderService`             | `PaymentOrderRefundedV1` in outbox | `appendToOutbox` in `executeWithOrder`        | VERIFIED | Drives GNOTIF-03                                                            |
| `account.updated` webhook        | `tenant.applyStripeCapabilities()` | `handleAccountUpdated` → `tenantRepo.save()`  | VERIFIED | `findByStripeAccountId` added to TenantRepository                           |
| D-06 orphan guard                | DB `payment_refunds` write         | `upsertByPaymentIntentId(status:'orphan')`    | BROKEN   | 'orphan' not in `payments_status_chk` CHECK                                 |
| `BrandTheme.primaryColor`        | email `accentColor`                | `brand?.theme` passed as `GuestBrandTheme`    | BROKEN   | Field name mismatch: theme has `primaryColor`, template reads `accentColor` |

---

## Data-Flow Trace (Level 4)

| Artifact                       | Data Variable   | Source                                          | Produces Real Data                                     | Status                       |
| ------------------------------ | --------------- | ----------------------------------------------- | ------------------------------------------------------ | ---------------------------- |
| `OrderStatusPoller`            | `status`        | `GET /v1/orders/:id/status` → `GetOrderService` | Yes — live order aggregate from DB                     | FLOWING                      |
| `StripePaymentElement`         | `clientSecret`  | `POST /v1/checkout/payment-intent` → Stripe API | Yes — live PaymentIntent from Stripe                   | FLOWING                      |
| `SendGuestNotificationService` | `customerEmail` | `orders.customer_email` column                  | Yes — set at order creation via `CreateOrderService`   | FLOWING                      |
| Brand theme in emails          | `accentColor`   | `BrandTheme.accentColor`                        | No — `BrandTheme` has `primaryColor` not `accentColor` | STATIC (defaults to #1a1a1a) |

---

## Anti-Patterns Found

| File                                    | Pattern                                                                                    | Severity | Impact                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------- |
| `handle-stripe-event.service.ts:198`    | `status: 'orphan'` not in DB CHECK constraint                                              | BLOCKER  | Orphan auto-refund fails at DB level; duplicate charges not refunded                        |
| `send-guest-notification.service.ts:61` | `brand?.theme` passed as `GuestBrandTheme` where field name `primaryColor` ≠ `accentColor` | WARNING  | All guest emails use default #1a1a1a accent regardless of brand; GNOTIF-04 partially broken |
| Locale hardcoded to `'ru'`              | `const locale = 'ru'` in `send-guest-notification.service.ts:59`                           | INFO     | English-language guests receive Russian emails; acknowledged as fast-follow                 |

---

## Gaps Summary

### GAP-1 (BLOCKER): `'orphan'` status not in `payments_status_chk` DB constraint

The D-06 orphan late-PI auto-refund path writes `status: 'orphan'` to the `payments` table, but migration 0055 defines `payments_status_chk` with only 6 allowed values — `'orphan'` is not one of them. When a rare race condition fires (orphan PI succeeds after order already paid), the DB rejects the write, the webhook handler errors, Stripe retries indefinitely, and the duplicate charge is never refunded.

**Fix options:**

1. Add migration 0056 to add `'orphan'` to the CHECK constraint and the Drizzle schema `check()` call.
2. Skip the DB write for the orphan case entirely — call `createRefund` directly with `orphan:<piId>` idempotency key (no DB row needed since the PI is being immediately refunded).

Option 2 is simpler and avoids schema churn. The orphan row serves no persistent purpose since the PI is immediately refunded.

### WARNING-1: Brand accent color not applied to guest emails

`GuestBrandTheme.accentColor` is the field the template reads, but `BrandTheme` (from `@resto/domain`) has `primaryColor` — not `accentColor`. When `brand?.theme` (type `BrandTheme`) is passed as `GuestBrandTheme`, the `accentColor` field will always be `undefined`, causing emails to render with the fallback `#1a1a1a` regardless of the brand's `primaryColor`.

**Fix:** In `send-guest-notification.service.ts`, map the brand theme explicitly:

```typescript
const brandTheme = brand?.theme
  ? { logoUrl: brand.theme.logoUrl, accentColor: brand.theme.primaryColor }
  : null;
```

This is a WARNING (not a blocker for the live smokes) — emails send correctly, but without the brand's accent color. Should be fixed before launch.

---

## Human Verification Required

The following 6 items require a live Stripe test environment and cannot be verified from code alone.

### 1. Admin onboarding click-through

**Test:** Start dev stack + API with `STRIPE_SECRET_KEY=sk_test_...`. Log into admin as owner, open brand → Payouts page. Click "Connect Stripe". Confirm redirect to Stripe hosted onboarding flow at a real `account_link` URL.
**Expected:** Button visible in not-connected state; click redirects to Stripe; GET `/v1/tenancy/stripe-status` returns `onboardingStatus: 'pending'` after account creation.
**Why human:** Requires real Stripe test keys, running stack, and a browser for the redirect.

### 2. End-to-end payment success + confirmation page

**Test:** Complete Stripe onboarding (get `charges_enabled: true` via test account). Add items → checkout → enter guest email → card `4242 4242 4242 4242`.
**Expected:** Confirmation page shows "Confirming payment…" then flips to "Payment confirmed" after `account.updated` + `payment_intent.succeeded` webhooks. `orders.customer_email` populated in DB.
**Why human:** Requires Stripe CLI (`stripe listen --forward-to`), real keys, browser.

### 3. SCA/3DS path

**Test:** Repeat end-to-end checkout with card `4000 0027 6000 3184`.
**Expected:** 3DS challenge appears in-browser, completes, order reaches `paid`.
**Why human:** Browser interaction with Stripe 3DS modal required.

### 4. Failure + same-order retry (no double-charge)

**Test:** Checkout with failing card `4000 0000 0000 0002`. See failure message + "Try again". Retry with `4242 4242 4242 4242`.
**Expected:** Success on retry. Stripe test dashboard shows exactly one charge (prior PI canceled). Confirm no duplicate payment.
**Why human:** Requires live Stripe dashboard inspection.

### 5. Refund smoke (full + partial + non-owner 403)

**Test:** On a paid test order, call `POST /v1/orders/:id/refund` as owner with `amountMinor + reason`. Then call same with non-owner session.
**Expected:** Partial refund creates Stripe refund, `payment_refunds` row inserted, order stays `paid`. Full remaining refund flips order to `refunded`. Non-owner gets 403.
**Why human:** Requires a real paid Stripe test order.

### 6. Guest email delivery

**Test:** After payment success smoke, check MailHog or Resend test dashboard for guest email at the email provided during checkout.
**Expected:** HTML email arrives with order #, items, total, brand name. Logo visible if brand has `logoUrl` set.
**Why human:** Email delivery requires running mail transport.

---

## Code Gaps to Fix Before Founder Live Smokes

**Fix these 2 items before running the live smokes:**

1. **BLOCKER — `'orphan'` status in `payments` table**: Add `'orphan'` to `payments_status_chk` constraint (migration 0056 + Drizzle schema), OR eliminate the DB write in the orphan path and call `createRefund` directly.

2. **WARNING — Brand accent color not mapped**: In `send-guest-notification.service.ts`, map `brand.theme.primaryColor → accentColor` explicitly when constructing `GuestBrandTheme`.

---

_Verified: 2026-06-27T21:21:54Z_
_Verifier: Claude (gsd-verifier)_
