---
phase: 08-payments-stripe-connect
plan: 04b
type: execute
wave: 5
depends_on: ["08-04a", "08-03"]
files_modified:
  - apps/website/components/checkout/checkout-form.tsx
  - apps/website/components/checkout/payment-element.tsx
  - apps/website/app/checkout/confirmation/[orderId]/page.tsx
  - apps/website/components/checkout/order-status-poller.tsx
  - apps/website/lib/checkout-api.ts
  - apps/website/lib/env.ts
  - apps/website/package.json
autonomous: false
requirements: [SITE-08, PAY-06, PAY-08]
user_setup: []

must_haves:
  truths:
    - "SITE-08: after payment the guest lands on /checkout/confirmation/[orderId] showing order #, items, total, ETA, and a LIVE status that flips to paid when the webhook lands"
    - "D-08: a card needing 3DS drives the order to requires_action; the guest completes the challenge via the Stripe Payment Element, then the webhook flips it to paid"
    - "D-06: on payment failure the guest retries on the SAME order — a new PaymentIntent; the order + cart are preserved (no new order on retry)"
    - "B2: the checkout contact form persists the guest email to the order's customer_email at order creation (recipient source for GNOTIF-01/03 in 08-06)"
    - "the confirmation page is a READ-ONLY poll of order status (webhook is the single writer of paid)"
  artifacts:
    - path: "apps/website/app/checkout/confirmation/[orderId]/page.tsx"
      provides: "SITE-08 confirmation page"
      contains: "confirmation"
    - path: "apps/website/components/checkout/checkout-form.tsx"
      provides: "wired Place-order button (no longer disabled) + guest email capture + Stripe Payment Element + SCA handling"
      contains: "PaymentElement"
  key_links:
    - from: "checkout-form.tsx"
      to: "POST /v1/checkout/payment-intent (08-04a)"
      via: "create order (with customer_email) then create PaymentIntent"
      pattern: "payment-intent"
    - from: "order-status-poller.tsx"
      to: "GET /v1/orders/:id/status (08-04a)"
      via: "poll-with-backoff until paid/failed"
      pattern: "poll"
---

<objective>
Wire the disabled website checkout into the real money flow and ship SITE-08, consuming the
08-04a endpoints. On submit the checkout form creates the order from the cart (capturing the
guest's email into orders.customer_email — B2), then calls POST /v1/checkout/payment-intent
(08-04a) and mounts the Stripe Payment Element to confirm. Cards needing 3DS drive the order
to `requires_action` (D-08) and complete the challenge in-browser. On failure the guest
retries on the SAME order with a new PaymentIntent — the cart + order are preserved (D-06).
The confirmation page is a READ-ONLY poll of GET /v1/orders/:id/status (the webhook is the
single writer of `paid`, CTO HIGH #4) — it shows a "confirming payment…" interstitial until
the webhook flips the order to paid, papering over the webhook↔return race.

Purpose: turn the storefront into a revenue surface end-to-end with money-correct,
SCA-aware, double-charge-safe checkout, guest-email capture, and a confirmation page that
survives async webhooks.
Output: SITE-08 + the wired website checkout flow (Payment Element, retry, confirmation poller).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/08-payments-stripe-connect/08-CONTEXT.md
@.planning/phases/08-payments-stripe-connect/08-01-SUMMARY.md
@.planning/phases/08-payments-stripe-connect/08-02-SUMMARY.md
@.planning/phases/08-payments-stripe-connect/08-03-SUMMARY.md
@.planning/phases/08-payments-stripe-connect/08-04a-SUMMARY.md

<interfaces>
<!-- Website seams + the 08-04a endpoints. -->

From apps/website/components/checkout/checkout-form.tsx (the stub to wire):
- 'use client'; react-hook-form + zodResolver(createCheckoutSchema(mode)); useCartStore (@resto/cart) for items/mode.
- onSubmit currently only preventDefault(); the Place-order Button is `disabled aria-disabled` with a "coming soon" tooltip.
- OrderSummary, AddressInput, OrderTimeSelector already present. The contact form fields (name/phone) exist — ADD an email field
  whose value flows into the create-order body so it lands in orders.customer_email (B2).

From apps/website/lib/api-client.ts:
- 'server-only'; fetchMenuPublic/fetchAvailabilityPublic use apiOrigin() + x-forwarded-host. Add CLIENT-callable
  helpers for create-order + create-payment-intent + get-order-status in a NEW non-'server-only' module (lib/checkout-api.ts)
  because these run from the browser.

From @resto/cart: the cart store holds items (ORD-03-compatible snapshot) + mode + table. The create-order
POST body must match CreateOrderInputDto (apps/api ordering/application/dto.ts) — server recomputes prices
(server-authoritative pricing, quick-task 260620-vss). Never send client prices as authoritative. Include the guest
email field in the create-order body so the API persists it to orders.customer_email (08-01 added the column; confirm
CreateOrderInputDto carries customerEmail — if not, the create-order DTO must accept it; coordinate via 08-04a/ordering).

From 08-04a: POST /v1/checkout/payment-intent { orderId } → { clientSecret, connectedAccountId, publishableKey?, orderId };
GET /v1/orders/:id/status → { status, total, currency, orderNumber, eta? } (read-only).
From 08-03: payments.order_payment_succeeded/failed.v1 drive status; webhook is the single writer of paid.

Stripe.js (browser): @stripe/stripe-js loadStripe + @stripe/react-stripe-js <Elements>/<PaymentElement>/useStripe/useElements;
confirmPayment with the clientSecret; for a DIRECT charge on a connected account, loadStripe is initialized with the
platform publishable key + the connected account via the `stripeAccount` option on Elements. Verify the exact
connected-account option for stripe.js before wiring (Context7 stripe-js if unsure).
</interfaces>

@apps/website/components/checkout/checkout-form.tsx
@apps/website/lib/api-client.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: wire the checkout form (guest email capture + Payment Element + SCA + same-order retry)</name>
  <read_first>
    - apps/website/components/checkout/checkout-form.tsx (the disabled stub: RHF, useCartStore, OrderSummary, contact fields, the disabled Button + tooltip to remove)
    - apps/website/lib/api-client.ts (apiOrigin + the server-only fetchers; add browser fetchers in a client-safe module)
    - apps/website/lib/env.ts (add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
    - @resto/cart store API (items/mode/table → CreateOrderInputDto body)
    - the ordering CreateOrderInputDto (confirm it carries customerEmail; if not, the email must be added to the create-order input — note it for 08-04a/ordering)
  </read_first>
  <behavior>
    - The contact section gains an email input (required, validated) whose value is sent in the create-order body → persisted to orders.customer_email (B2). This is the recipient for GNOTIF-01/03 (08-06).
    - On submit (button no longer disabled, valid form): POST /v1/orders to create the order from the cart (server recomputes prices; body includes customerEmail), then POST /v1/checkout/payment-intent { orderId } → { clientSecret, connectedAccountId }. Mount <Elements> (stripe.js, initialized with NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY + the connected account option) + <PaymentElement>; call stripe.confirmPayment with a return_url to /checkout/confirmation/[orderId].
    - SCA (D-08): if confirmPayment returns requires_action / next_action, the Payment Element handles the challenge in-browser; on success Stripe redirects to the confirmation page. Never assume single-step confirm.
    - Failure (PAY-08, D-06): on a payment error surface the message + a "Try again" CTA that retries on the SAME orderId (re-POST /v1/checkout/payment-intent → new clientSecret; the cart + order are preserved). Do NOT create a new order on retry.
  </behavior>
  <action>
    Install @stripe/stripe-js + @stripe/react-stripe-js into apps/website (legitimacy: these are official Stripe packages — verify on npmjs.com/package/@stripe/stripe-js before install if no prior audit; pin current stable). Add a client-safe lib/checkout-api.ts with browser fetch helpers (createOrder including customerEmail, createPaymentIntent, getOrderStatus) — NOT 'server-only'. Rewrite checkout-form.tsx: add the email field to the contact section (RHF + zod), remove the disabled Button + tooltip, add the submit handler that creates the order (with email) then the PaymentIntent, and render the Stripe Payment Element (new payment-element.tsx client component wrapping <Elements>/<PaymentElement> with the connected-account option + confirmPayment). Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to lib/env.ts with the G-05 isLocalhostUrl-style fail-loud discipline already used for NEXT_PUBLIC_API_ORIGIN. Wire the "Try again" retry to re-create only the PaymentIntent on the same orderId.
  </action>
  <verify>
    <automated>cd /Users/mp_dev/projects/restos && pnpm --filter website typecheck</automated>
  </verify>
  <acceptance_criteria>
    - The contact form has a required email field whose value is sent to create-order and persisted to orders.customer_email (B2) — assert the create-order body includes customerEmail.
    - The Place-order button is no longer hardcoded disabled; submit creates an order then a PaymentIntent and mounts the Payment Element.
    - Retry uses the SAME orderId (no new order created on retry) — grep the retry handler.
    - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is fail-loud in lib/env.ts.
    - `pnpm --filter website typecheck` exits 0.
  </acceptance_criteria>
  <done>The storefront checkout is wired with guest-email capture, the Payment Element, SCA handling, and same-order retry.</done>
</task>

<task type="auto">
  <name>Task 2: SITE-08 confirmation page + read-only status poller</name>
  <read_first>
    - apps/website/app/checkout (existing checkout route structure; add confirmation/[orderId])
    - apps/website/lib/checkout-api.ts (getOrderStatus from Task 1)
    - an existing website client component using poll/backoff or interval (mirror its cleanup discipline) if present
  </read_first>
  <behavior>
    - Confirmation page /checkout/confirmation/[orderId] (SITE-08): render order #, items, total, ETA from the status read; an <OrderStatusPoller> client component polls GET /v1/orders/:id/status with backoff and shows "Confirming payment…" until status flips to paid (webhook-driven), then shows the confirmed state. On a terminal failed status, show the failure + a retry link back to checkout. Keep amount/total display sourced from the server status response, never recomputed client-side. Read-only — the page never marks an order paid.
  </behavior>
  <action>
    Create app/checkout/confirmation/[orderId]/page.tsx (RSC shell rendering the initial status) + order-status-poller.tsx ('use client', poll-with-backoff until paid/failed with proper interval cleanup). The poller calls getOrderStatus and renders the confirming/paid/failed states. Source all displayed amounts from the server status response.
  </action>
  <verify>
    <automated>cd /Users/mp_dev/projects/restos && pnpm --filter website typecheck && pnpm --filter website build</automated>
  </verify>
  <acceptance_criteria>
    - /checkout/confirmation/[orderId] renders order #, items, total, ETA and polls status until paid (read-only; webhook is the writer).
    - On a failed terminal status the page shows a retry link back to checkout.
    - Displayed totals come from the server status response (not recomputed client-side).
    - `pnpm --filter website build` succeeds.
  </acceptance_criteria>
  <done>SITE-08 confirmation page polls order status until the webhook flips it to paid; read-only; survives the webhook race.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Checkpoint: end-to-end test-mode checkout smoke (success + SCA + retry-no-double-charge + can-accept-money gate)</name>
  <action>Human runs the full test-mode checkout via Stripe CLI and confirms each path. Steps in how-to-verify.</action>
  <what-built>End-to-end test-mode checkout: create order (with guest email) → PaymentIntent (direct charge to a test connected account) → Stripe Payment Element → webhook (via Stripe CLI) flips the order to paid → confirmation page updates live. Includes the SCA (3DS test card) and same-order-retry paths and the server-side can-accept-money gate.</what-built>
  <how-to-verify>
    1. Start the dev stack + api + website (`pnpm dev:up` then run api + website dev servers).
    2. Forward webhooks locally: `stripe listen --forward-to localhost:<api-port>/webhook/stripe` and copy the `whsec_…` into STRIPE_WEBHOOK_SECRET; set test-mode STRIPE_SECRET_KEY + NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
    3. Onboard a test connected account from the ADMIN payouts page (08-02 Task 3) → complete Stripe's test onboarding so charges_enabled flips via account.updated.
    4. Add items to cart → checkout → enter a guest email → pay with the success test card `4242 4242 4242 4242`. Confirm: confirmation page shows the order and flips from "Confirming payment…" to paid; confirm orders.customer_email is populated (psql or admin).
    5. Repeat with the 3DS test card `4000 0027 6000 3184` — confirm the challenge appears, completes, and the order reaches paid.
    6. Force a failure (card `4000 0000 0000 0002`) → see the failure + "Try again" → retry on the SAME order succeeds with a success card; confirm exactly one charge exists in the Stripe test dashboard (no double-charge).
    7. Confirm an un-onboarded tenant's checkout is rejected server-side (canAcceptPayments gate), not just hidden in the UI.
  </how-to-verify>
  <resume-signal>Type "checkout verified" once the success, SCA, failure-retry-no-double-charge, guest-email-persist, and can-accept-money-gate paths all behave, or describe what broke.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser → checkout (08-04a) endpoint | client cart + amounts are untrusted; server recomputes total + gates on capability |
| guest browser return → confirmation | the return is read-only; it must not be able to mark an order paid |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-08-21 | Tampering | browser marks order paid | mitigate | confirmation page is read-only poll; webhook is the single writer of paid (CTO HIGH #4) |
| T-08-22 | Tampering/financial | double-charge on retry | mitigate | retry re-creates only the PaymentIntent on the same order; 08-04a cancels the prior PI + increments the attempt key (D-06) |
| T-08-23 | Information disclosure | publishable key vs secret confusion | mitigate | only the publishable key (NEXT_PUBLIC_*) reaches the browser; secret stays server-side |
| T-08-23b | Information disclosure / GDPR | guest email captured at checkout | mitigate | persisted to orders.customer_email which the GDPR erasure pipeline covers (08-01 acceptance criterion proves DELETE FROM orders) |
</threat_model>

<verification>
- `pnpm --filter website typecheck` + `pnpm --filter website build` green.
- The checkout form captures + sends the guest email; retry is same-order; the confirmation page polls read-only.
- Human-verify checkpoint confirms the full test-mode flow incl. SCA + no-double-charge retry + guest-email persist + can-accept-money gate.
</verification>

<success_criteria>
- SITE-08 confirmation page live with order #, items, total, ETA, and live status; PAY-06 checkout (via 08-04a) creates a direct-charge PaymentIntent; PAY-08 failure → same-order retry.
- Guest email captured into orders.customer_email (B2); SCA requires_action handled; same-order retry double-charge-safe; confirmation page survives the webhook race via polling.
</success_criteria>

<output>
Create `.planning/phases/08-payments-stripe-connect/08-04b-SUMMARY.md` when done
</output>
