---
phase: 08-payments-stripe-connect
plan: 04a
type: execute
wave: 4
depends_on: ["08-01", "08-02", "08-03"]
files_modified:
  - apps/api/src/contexts/payments/application/create-checkout-payment.service.ts
  - apps/api/src/contexts/payments/interfaces/http/checkout.controller.ts
  - apps/api/src/contexts/payments/interfaces/http/error-mapping.ts
  - apps/api/src/contexts/payments/application/dto.ts
  - apps/api/src/contexts/payments/payments.module.ts
  - apps/api/src/contexts/ordering/interfaces/http/orders.controller.ts
autonomous: true
requirements: [PAY-06, PAY-08, PAY-13, SITE-08]
user_setup: []

must_haves:
  truths:
    - "D-12/PAY-13: the checkout endpoint enforces tenant.canAcceptPayments() SERVER-SIDE before creating a PaymentIntent — UI gating alone is bypassable"
    - "D-08: a card needing 3DS drives the order to requires_action; the server creates the PaymentIntent + transitions the order, the browser (08-04b) completes the challenge"
    - "D-06: on payment failure the guest retries on the SAME order — a new PaymentIntent with an incremented attempt; the prior in-flight PI is canceled first (double-charge guard)"
    - "amount/currency integrity: the PaymentIntent amount = the server-computed order total and currency = the tenant's settlement currency; client amounts are never trusted"
    - "SITE-08 substrate: GET /v1/orders/:id/status is a READ-ONLY poll of order status (webhook is the single writer of paid) consumed by the 08-04b confirmation page"
  artifacts:
    - path: "apps/api/src/contexts/payments/application/create-checkout-payment.service.ts"
      provides: "server-authoritative PaymentIntent creation gated on canAcceptPayments + cancel-prior-PI"
      contains: "canAcceptPayments"
    - path: "apps/api/src/contexts/payments/interfaces/http/checkout.controller.ts"
      provides: "POST /v1/checkout/payment-intent (server gate)"
      contains: "payment-intent"
  key_links:
    - from: "checkout.controller.ts"
      to: "create-checkout-payment.service"
      via: "POST /v1/checkout/payment-intent gated by canAcceptPayments"
      pattern: "payment-intent"
    - from: "orders.controller.ts"
      to: "GetOrderService"
      via: "GET /v1/orders/:id/status read-only"
      pattern: "status"
---

<objective>
Ship the server-authoritative half of checkout (the API). POST /v1/checkout/payment-intent
creates a PaymentIntent (amount = server-computed total, currency = tenant settlement
currency, application fee from config) ONLY after the server-side `canAcceptPayments()`
predicate passes (D-12 — UI gating is bypassable). Cards needing 3DS drive the order to
`requires_action` (D-08). On failure the guest retries on the SAME order with a new
PaymentIntent after the prior one is canceled (D-06). This plan also exposes the read-only
GET /v1/orders/:id/status that the 08-04b confirmation page polls (the webhook is the single
writer of `paid`, CTO HIGH #4). The website wiring + Payment Element + confirmation page live
in 08-04b, which depends on this plan's endpoints.

Purpose: a money-correct, SCA-aware, double-charge-safe checkout endpoint + the order-status
read the storefront needs — server-side, before any browser code.
Output: the checkout/payment-intent endpoint, the can-accept gate, and the status read.
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

<interfaces>
<!-- The order/payment substrate. -->

From apps/api ordering: POST /v1/orders (@Public, @RequireActiveTenant) already creates an order from the cart.
GetOrderService.execute({ orderId }) returns the OrderSnapshot (status, items, total, currency). Server-authoritative
pricing already enforced (quick-task 260620-vss) — never trust client prices.

From 08-01: Order has requires_action + requireAction(paymentIntentId); tenant.canAcceptPayments(); orders.customer_email exists.
From 08-02: adapter.createPaymentIntent (direct charge, returns clientSecret) + cancelPaymentIntent + STRIPE_APPLICATION_FEE_AMOUNT.
From 08-03: payments table tracks the order's PaymentIntents (+ attempt); payments.order_payment_succeeded/failed.v1 drive status; webhook is the single writer of paid; payment-drizzle.repository.ts loads/inserts payment rows.
</interfaces>

@apps/api/src/contexts/ordering/interfaces/http/orders.controller.ts
@apps/api/src/contexts/ordering/application/get-order.service.ts
@apps/api/src/contexts/ordering/application/create-order.service.ts
@apps/api/src/contexts/tenancy/domain/tenant.aggregate.ts
@apps/api/src/contexts/payments/infrastructure/payment-drizzle.repository.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: server-authoritative checkout payment endpoint (canAcceptPayments gate + cancel-prior-PI + SCA)</name>
  <read_first>
    - apps/api/src/contexts/ordering/application/get-order.service.ts + create-order.service.ts (order load + server-computed total/currency)
    - apps/api/src/contexts/tenancy/domain/tenant.aggregate.ts (canAcceptPayments) + tenant repository
    - apps/api/src/contexts/payments/infrastructure/payment-drizzle.repository.ts (08-03 — track the order's PaymentIntents + attempt counter)
    - apps/api/src/contexts/tenancy/infrastructure/stripe-connect.adapter.ts (createPaymentIntent / cancelPaymentIntent, application fee from config)
    - apps/api/src/config/env.schema.ts (STRIPE_APPLICATION_FEE_AMOUNT)
  </read_first>
  <behavior>
    - POST /v1/checkout/payment-intent (@Public, @RequireActiveTenant) body { orderId }: load the order (tenant-scoped); load the tenant; if !tenant.canAcceptPayments() → 409/403 PaymentsNotEnabledError (D-12 server gate). If the order is not in {created, requires_action} (e.g. already paid) → 409.
    - amount = server order total in minor units; currency = the tenant settlement currency; reject if order.currency !== tenant settlement currency (D-05 drift guard) with a clear error rather than letting Stripe fail opaquely.
    - applicationFeeMinor = STRIPE_APPLICATION_FEE_AMOUNT (config, default 0 — D-03).
    - Double-charge guard (D-06): if there is a prior non-terminal PaymentIntent for this order, cancel it via adapter.cancelPaymentIntent before creating a new one; increment the attempt counter so the new PI idempotency key (pi:<orderId>:<attempt>) differs.
    - Create the PaymentIntent (direct charge, metadata.orderId set so the webhook can map back); transition the order to requires_action via Order.requireAction (SCA state, D-08) and persist a payment row (status requires_action, payment_intent_id). Return { clientSecret, connectedAccountId, publishableKey?, orderId }.
  </behavior>
  <action>
    Create payments/application/create-checkout-payment.service.ts with execute({ orderId }) implementing <behavior>. Add PaymentsNotEnabledError + CurrencyMismatchError + a payment-intent error mapping (409/403/422) in payments/interfaces/http/error-mapping.ts. Create payments/interfaces/http/checkout.controller.ts (@Controller('v1/checkout'), @Post('payment-intent'), @Public, @RequireActiveTenant, RestoZodValidationPipe on the body DTO, wrapWith the payments error mapping). Extend payments/application/dto.ts with CreatePaymentIntentInput + a CreatePaymentIntentResponse schema. Wire the service + controller in payments.module.ts (it already imports OrderingModule + TenancyModule from 08-03; add the STRIPE_CONNECT_PORT usage). Reuse the adapter's metadata param to stamp orderId on the PaymentIntent.
  </action>
  <verify>
    <automated>cd /Users/mp_dev/projects/restos && pnpm --filter @resto/api typecheck && pnpm --filter @resto/api vitest run apps/api/src/contexts/payments/application/create-checkout-payment.service.spec.ts</automated>
  </verify>
  <acceptance_criteria>
    - Test: checkout for a tenant with canAcceptPayments()=false → 409/403 PaymentsNotEnabledError, no PaymentIntent created.
    - Test: amount passed to adapter.createPaymentIntent equals the server order total (NOT any client value) and currency equals the tenant settlement currency.
    - Test: a second checkout on the same order with a prior in-flight PI → cancelPaymentIntent called once, then create with an incremented-attempt idempotency key (D-06).
    - Test: order transitions to requires_action and a payment row (status requires_action) is written.
    - typecheck exits 0.
  </acceptance_criteria>
  <done>Checkout endpoint is server-authoritative, can-accept-money gated, currency-integrity checked, double-charge guarded, and SCA-aware.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: read-only public order-status endpoint (SITE-08 substrate for the confirmation poller)</name>
  <read_first>
    - apps/api/src/contexts/ordering/interfaces/http/orders.controller.ts (the @Public + @RequireActiveTenant controller conventions + wrapWith error mapping)
    - apps/api/src/contexts/ordering/application/get-order.service.ts (returns the OrderSnapshot: status, items, total, currency, orderNumber, eta?)
  </read_first>
  <behavior>
    - GET /v1/orders/:id/status (@Public, @RequireActiveTenant) returns { status, total, currency, orderNumber, eta? } via GetOrderService — the Phase-10 ORDINT endpoint is not built yet, so ship the minimal status read here (note in the SUMMARY that Phase 10 may extend it). Read-only — it MUST NOT mutate order state; the webhook is the single writer of paid.
  </behavior>
  <action>
    Add a GET /v1/orders/:id/status handler to orders.controller.ts (@Public, @RequireActiveTenant), delegating to GetOrderService.execute and projecting the read-only status shape in <behavior>. Reuse the existing wrapWith error mapping. Keep it read-only — no write path. Note in the SUMMARY that 08-04b's confirmation poller consumes this and Phase 10 may extend the projection.
  </action>
  <verify>
    <automated>cd /Users/mp_dev/projects/restos && pnpm --filter @resto/api typecheck && pnpm --filter @resto/api vitest run apps/api/src/contexts/ordering</automated>
  </verify>
  <acceptance_criteria>
    - Test: GET /v1/orders/:id/status returns the order status/total/currency/orderNumber (read-only) and never mutates state.
    - The route is @Public + @RequireActiveTenant.
    - typecheck exits 0.
  </acceptance_criteria>
  <done>A read-only public order-status endpoint exists for the 08-04b confirmation poller.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser → checkout endpoint | client cart + amounts are untrusted; server recomputes total + gates on capability |
| browser → order-status read | the status read is read-only; it must not be able to mark an order paid |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-08-19 | Tampering | client sends a forged/low amount | mitigate | server uses the recomputed order total + tenant settlement currency; client amounts never trusted; currency-mismatch rejected |
| T-08-20 | Elevation of privilege | un-KYC'd tenant takes money | mitigate | server-side canAcceptPayments() gate at the checkout endpoint (D-12, PAY-13) — not UI-only |
| T-08-21 | Tampering | status read mutates order | mitigate | GET /v1/orders/:id/status is read-only; webhook is the single writer of paid (CTO HIGH #4) |
| T-08-22 | Tampering/financial | double-charge on retry | mitigate | cancel prior in-flight PI + incremented-attempt idempotency key before creating a new PI (D-06) |
</threat_model>

<verification>
- `pnpm --filter @resto/api typecheck` green.
- Service specs prove the can-accept-money gate, amount/currency integrity, cancel-prior-PI, and requires_action transition.
- The order-status read is read-only and public+tenant-scoped.
</verification>

<success_criteria>
- PAY-06 checkout creates a direct-charge PaymentIntent server-side; PAY-13 enforced server-side; PAY-08 failure path sets up same-order retry (browser in 08-04b).
- SCA requires_action handled; same-order retry is double-charge-safe; the SITE-08 status read exists for the 08-04b confirmation page.
</success_criteria>

<output>
Create `.planning/phases/08-payments-stripe-connect/08-04a-SUMMARY.md` when done
</output>
