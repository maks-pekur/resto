# ADR 0009: Stripe Connect (Express) as the payments provider

- **Status:** accepted
- **Date:** 2026-04-30
- **Deciders:** Resto core team

## Context

Resto operates as a marketplace: customers pay tenants (restaurants) for
orders; Resto takes a per-transaction commission. We need a payments
provider that:

- Supports a marketplace flow with per-tenant payout accounts.
- Handles compliance (KYC, AML, tax forms, regulatory reporting) so we
  do not become a money transmitter.
- Supports SCA / 3DS for European cards, Apple/Google Pay, regional
  payment methods.
- Has mature webhook, dispute, and refund flows.
- Is reasonable to integrate with a TypeScript backend.

## Decision

Use **Stripe Connect** with **Express connected accounts**. Resto is the
platform; each tenant onboards a Stripe Express account through Stripe's
hosted onboarding flow. Customer charges are created on the platform with
`application_fee_amount` and `transfer_data.destination` pointing at the
tenant — Stripe handles the split and the payout to the tenant.

## Alternatives considered

- **Stripe Connect Custom accounts.** Strongest argument: full control
  over the tenant onboarding UX. Rejected: we take on substantially more
  KYC/AML responsibility and have to build dispute/identity-verification
  flows ourselves. Express trades a Stripe-branded onboarding screen for
  Stripe owning the regulatory surface — the right tradeoff for our
  stage.
- **Stripe Connect Standard accounts.** Strongest argument: simplest;
  tenants have their own full Stripe dashboard. Rejected: too much
  control sits with the tenant — we cannot enforce platform-wide
  policies (refund windows, dispute handling) and the tenant pays
  Stripe directly, which weakens our "payments are a platform feature"
  story.
- **Adyen for Platforms.** Strongest argument: better international
  acquiring rates at high volume, broader regional method coverage.
  Rejected: integration complexity is significantly higher, onboarding
  cycle for the platform itself is multi-week, and we are nowhere near
  the volume that justifies the cost.
- **Mollie / regional providers.** Strongest argument: better fees and
  local methods within a single region. Rejected: marketplace
  capabilities are weaker; we would build the multi-region story
  ourselves later.
- **Direct integrations per tenant (each tenant brings their own
  processor).** Rejected: we would lose the platform commission model
  and uniform reporting.

## Consequences

### Positive

- Stripe owns KYC/AML, identity verification, tax form generation
  (1099, etc.), and ongoing compliance for every tenant.
- Per-transaction commission is a single field on the charge object;
  no settlement code to write.
- 3DS/SCA, Apple Pay, Google Pay, BNPL methods (Klarna, Afterpay) are
  available behind one API.
- Disputes and chargebacks flow through Stripe's UI for the tenant on
  Express accounts.
- TypeScript SDK is high quality and maintained.

### Negative

- Onboarding UX is Stripe-branded — tenants see a Stripe page during
  account creation. Acceptable for our market; we will theme it where
  Stripe allows.
- Stripe Connect must be approved by Stripe for marketplace use.
  Approval process is short for restaurant marketplaces but is a hard
  prerequisite before we can charge any production traffic.
- Stripe fees are not the cheapest at high volume. We accept this
  until we have leverage to negotiate or migrate to Adyen.

### Neutral

- Customer payment methods are stored on the platform account, not on
  tenant accounts. Payouts go to the tenant; the customer relationship
  stays with the platform.
- Application fee structure (% per transaction + fixed monthly per
  tenant) is configurable in code; revenue model is not locked by this
  decision.

## Implementation notes

- The `payments` bounded context lives at `apps/api/src/contexts/payments/`
  (added in MVP-2, not MVP-1).
- All Stripe API calls go through a single `StripeClient` adapter in
  `infrastructure/`; the domain depends only on a `PaymentsPort`
  interface defined in `application/`.
- Webhooks: dedicated endpoint `/v1/webhooks/stripe`, signature verified
  via Stripe SDK, events written into the inbox table for idempotent
  processing by the dispatcher.
- Idempotency: every charge creation passes a deterministic
  idempotency key derived from `(tenantId, orderId, attemptCount)`.
- Test mode: each environment has a separate Stripe Connect platform.
  Test cards and test accounts only for staging.
- PII / PCI: card data never touches our servers — Stripe Elements on
  the qr-menu and admin; we hold tokens (`payment_method` ids) and
  Stripe customer ids only.
