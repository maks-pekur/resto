---
phase: 08-payments-stripe-connect
plan: 04b
subsystem: website-checkout
tags:
  [
    stripe,
    payment-element,
    sca,
    same-order-retry,
    guest-email,
    confirmation-page,
    status-poller,
    site-08,
  ]

requires:
  - phase: 08-payments-stripe-connect
    plan: 04a
    provides: POST /v1/checkout/payment-intent, GET /v1/orders/:id/status

provides:
  - SITE-08 confirmation page at /checkout/confirmation/[orderId]
  - Wired website checkout form (Payment Element, guest email, SCA, same-order retry)
  - OrderStatusPoller client component (poll-with-backoff until paid/failed)
  - lib/checkout-api.ts (client-safe browser fetch helpers)
  - lib/client-env.ts (stripePublishableKey fail-loud env)
  - customerEmail field on POST /v1/orders (B2 — persisted to orders.customer_email)

affects:
  - 08-06: guest email (orders.customer_email) is the GNOTIF-01/03 recipient; now always populated at checkout

tech-stack:
  added:
    - '@stripe/stripe-js@9.8.0'
    - '@stripe/react-stripe-js@6.6.0'
  patterns:
    - 'Direct charge on connected account: loadStripe(pk, { stripeAccount: connectedAccountId }) per PI'
    - 'SCA: stripe.confirmPayment with redirect=always; on success Stripe redirects; on error (only case it returns) surface message + retry'
    - 'Same-order retry (D-06): retry re-calls POST /v1/checkout/payment-intent on existing orderId; server cancels prior PI; order + cart preserved'
    - 'Confirmation page: RSC shell fetches initial status server-side; OrderStatusPoller client component polls with backoff [1s,2s,3s,5s,10s] until terminal'
    - 'Read-only confirmation: page never marks paid; webhook is the single writer (CTO HIGH #4)'
    - 'client-env.ts: fail-loud for NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY — throws on empty; rejects non-live keys in production'

key-files:
  created:
    - apps/website/components/checkout/payment-element.tsx
    - apps/website/components/checkout/order-status-poller.tsx
    - apps/website/app/checkout/confirmation/[orderId]/page.tsx
    - apps/website/lib/checkout-api.ts
    - apps/website/lib/client-env.ts
    - apps/website/test/checkout-api.spec.ts
    - apps/website/test/order-status-poller.spec.tsx
  modified:
    - apps/website/components/checkout/checkout-form.tsx
    - apps/website/lib/checkout-schema.ts
    - apps/website/test/checkout-form.spec.tsx
    - apps/website/package.json
    - apps/api/src/contexts/ordering/application/dto.ts
    - apps/api/src/contexts/ordering/application/create-order.service.ts

key-decisions:
  - 'loadStripe is called per-PI (not at module init) with { stripeAccount: connectedAccountId } — required for direct charges on connected accounts; StripeElementsOptions does not expose stripeAccount'
  - 'confirmPayment with redirect=always: on success the page never receives control (redirect happens); on error it returns { error: StripeError } unconditionally — no conditional check needed'
  - 'checkout-api.ts is NOT server-only; getOrderStatus accepts an optional host param so RSC confirmation page can pass the Next.js request host for tenant resolution'
  - 'customerEmail added to CreateOrderInputSchema (was missing despite the DB column and Order aggregate supporting it) — Rule 2 auto-fix'
  - '/_global-error next build prerender failure is pre-existing (confirmed by reproducing on clean baseline); not caused by this plan'

metrics:
  duration: 90min
  completed: 2026-06-27
  tasks: 2
  files_modified: 13
---

# Phase 8 Plan 04b: Website Checkout — Payment Element + SITE-08 Confirmation

**Wires the disabled storefront checkout into the real Stripe money flow: Payment Element with direct-charge on connected account, SCA/3DS handling, same-order retry (double-charge-safe), guest email capture persisted to orders.customer_email, and a SITE-08 confirmation page that polls order status live until the webhook flips it to paid.**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-06-27T13:30:00Z
- **Completed:** 2026-06-27T15:03:00Z
- **Tasks:** 2 auto
- **Files modified:** 13

## Accomplishments

- **Wired `checkout-form.tsx`:** added required `email` field (persisted to `orders.customer_email` — B2), removed disabled button + tooltip, added submit handler that creates order then PaymentIntent, renders `<StripePaymentElement>` on success, shows error + retry on failure.

- **`payment-element.tsx`:** wraps `<Elements>` + `<PaymentElement>` with `loadStripe(pk, { stripeAccount })` initialized per-PI for direct charges. `stripe.confirmPayment` redirects to confirmation on success; on error (only return path) surfaces message to parent.

- **Same-order retry (D-06):** failure path captures `orderId`, retry re-calls `createPaymentIntent(orderId)` only — no new order created. Server (08-04a) cancels prior non-terminal PI + increments attempt key before issuing the new one.

- **SCA/3DS (D-08):** `confirmPayment` with `redirect: 'always'` — Stripe drives any 3DS challenge in-browser. After success Stripe redirects to the return URL. The confirmation page then polls until the webhook flips the order to `paid`.

- **`lib/checkout-api.ts`:** client-safe (no `server-only`) browser fetch helpers — `createOrder` (with `customerEmail`), `createPaymentIntent`, `getOrderStatus`. `x-forwarded-host` set from `window.location.host` on client, or from the optional `host` param when called server-side. All calls have a 30s `AbortSignal.timeout`.

- **`lib/client-env.ts`:** fail-loud `stripePublishableKey` — throws on missing/empty; rejects non-`pk_live_*` in production (same ADR-0020 I-3 discipline as the existing URL guards).

- **SITE-08 confirmation page** (`/checkout/confirmation/[orderId]`): RSC shell fetches initial status server-side (with `host` from Next.js `headers()` for tenant resolution). `<OrderStatusPoller>` client component polls `getOrderStatus` with backoff `[1s, 2s, 3s, 5s, 10s]` until a terminal status (`paid`, `failed`, `canceled`, `refunded`). Shows "Confirming payment…" pending state, confirmed state on `paid`, failure + retry link on `failed`/`canceled`. Amounts sourced from server response — never recomputed client-side. Read-only: no write path.

- **`customerEmail` added to `CreateOrderInputSchema`** and passed through `CreateOrderService` → `Order.create()` → persisted to `orders.customer_email`. The DB column and domain aggregate already supported it; only the DTO layer was missing it.

## Task Commits

| Task | Name                                                                        | Commit    | Key Files                                                                                          |
| ---- | --------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| 1    | Wire checkout form (guest email + Payment Element + SCA + same-order retry) | `adcb4b7` | checkout-form.tsx, payment-element.tsx, checkout-api.ts, client-env.ts, checkout-schema.ts, dto.ts |
| 2    | SITE-08 confirmation page + read-only status poller                         | `d492df3` | confirmation/[orderId]/page.tsx, order-status-poller.tsx                                           |

## Test Results

```
Website vitest — 55 tests / 9 files — all passing

New tests:
  test/checkout-api.spec.ts (5 tests):
    ✓ cartItemsToOrderItems — maps items omitting client prices
    ✓ createOrder — POSTs to /v1/orders, customerEmail in body
    ✓ createPaymentIntent — POSTs, returns clientSecret + connectedAccountId
    ✓ createPaymentIntent — throws CheckoutApiError on non-ok response
    ✓ getOrderStatus — GETs /v1/orders/:id/status, returns status projection

  test/order-status-poller.spec.tsx (6 tests):
    ✓ shows confirming state when pending
    ✓ shows confirmed state immediately when initialStatus is paid (no polling)
    ✓ shows failure state when initialStatus is failed
    ✓ polls until paid and flips to confirmed
    ✓ does not poll when initialStatus is already terminal
    ✓ retry link on failure points back to /checkout

Updated tests:
  test/checkout-form.spec.tsx (7 tests):
    ✓ (added) requires a valid email
    ✓ (fixed) existing tests updated for required email field in schema

API unit tests: 449 tests / 61 files — all passing
  (customerEmail addition to CreateOrderInputSchema is additive/optional — no breakage)

Website typecheck: tsc --noEmit clean (exit 0)

next build: pre-existing /_global-error Turbopack prerender failure (confirmed reproducible
on clean baseline before this plan's changes; digest 1320630652, same stack trace).
Build succeeds on all application pages.
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `customerEmail` absent from `CreateOrderInputSchema`**

- **Found during:** Task 1 implementation — plan required guest email persisted to `orders.customer_email` (B2), but `CreateOrderInputDto` had no `customerEmail` field
- **Issue:** The DB column (`orders.customer_email`), domain aggregate (`Order.create` + `customerEmail`), and repository already supported the field. Only the DTO and `CreateOrderService.execute()` were missing it, so email sent from the browser was silently dropped.
- **Fix:** Added `customerEmail: z.string().email().max(254).optional()` to `CreateOrderInputSchema`; passed `input.customerEmail ?? null` through `CreateOrderService` to `Order.create()`.
- **Files modified:** `apps/api/src/contexts/ordering/application/dto.ts`, `apps/api/src/contexts/ordering/application/create-order.service.ts`
- **Committed in:** `adcb4b7` (Task 1)

**2. [Rule 1 - Bug] Existing checkout schema tests broke after email field added**

- **Found during:** Task 1 test run — 3 existing schema tests failed because the `valid` fixture didn't include `email`
- **Fix:** Added `email: 'ann@example.com'` to the test fixture; added a new email validation test
- **Files modified:** `apps/website/test/checkout-form.spec.tsx`
- **Committed in:** `adcb4b7` (Task 1)

## Known Stubs

None — the checkout form calls real API endpoints; the confirmation page polls the real status endpoint. The "coming soon" tooltip is removed.

## Threat Surface Scan

All STRIDE mitigations from the plan's threat model implemented:

- **T-08-21 (browser marks paid):** confirmation page is read-only poll; no write path; webhook is the single writer.
- **T-08-22 (double-charge on retry):** retry re-calls `createPaymentIntent` on the same `orderId` only; server (08-04a) cancels prior PI before issuing new one.
- **T-08-23 (publishable key vs secret):** only `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` reaches the browser; `client-env.ts` enforces `pk_live_*` in production.
- **T-08-23b (guest email / GDPR):** persisted to `orders.customer_email` which the GDPR erasure pipeline (08-01) covers.

No new threat surface beyond what the plan's threat model covers.

## Live Smoke Checkpoint (awaiting founder)

**All code and automated tests are complete.** The following live test-mode verification must be performed by the founder with a running stack and Stripe CLI:

### Prerequisites

1. `pnpm dev:up` — start Postgres, Redis, NATS, MinIO
2. Run API dev server: `pnpm --filter api dev` (port 3000)
3. Run Website dev server: `pnpm --filter website dev` (port 3002)
4. Forward Stripe webhooks: `stripe listen --forward-to localhost:3000/webhook/stripe`
   - Copy the `whsec_…` value into the API's `STRIPE_WEBHOOK_SECRET` env var
5. Ensure test-mode keys are set: `STRIPE_SECRET_KEY=sk_test_…`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…`

### Smoke Steps

1. **Onboard a test connected account** from the admin payouts page (08-02 Task 3) → complete Stripe's test onboarding → `charges_enabled` flips via `account.updated`.

2. **Success path:** Add items → checkout → enter guest email → pay with `4242 4242 4242 4242` (any future date, any CVC)
   - Confirm: confirmation page shows "Confirming payment…" then flips to paid after webhook
   - Verify `orders.customer_email` is populated (psql or admin panel)

3. **SCA/3DS path:** Repeat with `4000 0027 6000 3184`
   - Confirm: 3DS challenge appears, completes, order reaches paid

4. **Failure + retry (no double-charge):** Use card `4000 0000 0000 0002`
   - Confirm: failure message + "Try again" appears
   - Retry with `4242 4242 4242 4242` → success
   - Confirm in Stripe test dashboard: exactly one charge, no duplicate

5. **can-accept-money gate:** Attempt checkout on a tenant/brand without a connected account
   - Confirm: server returns 409 (payments not enabled), error shown in UI — not just hidden

**Resume signal:** `"checkout verified"` once all 5 paths pass, or describe what broke.

## Self-Check: PASSED

Files exist:

- `apps/website/components/checkout/payment-element.tsx` — FOUND
- `apps/website/components/checkout/order-status-poller.tsx` — FOUND
- `apps/website/app/checkout/confirmation/[orderId]/page.tsx` — FOUND
- `apps/website/lib/checkout-api.ts` — FOUND
- `apps/website/lib/client-env.ts` — FOUND
- `apps/website/test/checkout-api.spec.ts` — FOUND
- `apps/website/test/order-status-poller.spec.tsx` — FOUND
- Commit `adcb4b7` — FOUND
- Commit `d492df3` — FOUND
