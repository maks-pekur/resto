# Phase 8: Payments (Stripe Connect) — Research

**Researched:** 2026-06-27
**Domain:** Stripe Connect Express, PaymentIntents, webhooks, SCA/3DS, refunds, guest email notifications
**Confidence:** HIGH (Stripe docs verified via WebFetch; codebase verified by direct file reads)

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** RestOS takes no per-order commission. `application_fee` = 0. Monetization = flat subscription per location.
- **D-02:** Direct charges on the connected account (NOT destination charges). Connected account is merchant-of-record, bears Stripe fees + dispute/chargeback liability. PAY-06's "destination" wording is superseded.
- **D-03:** application_fee_amount MUST be a config value (default 0), never a hardcoded literal.
- **D-04:** Refunds are owner-only, reason is mandatory (audit), full + partial both supported. Cancel/reject of a paid order = automatic refund.
- **D-05:** One currency per tenant, fixed at Stripe onboarding. Per-brand vs per-tenant reconciliation needed (schema has `stripeAccountId` + `defaultCurrency` on both `tenants` AND `brands`).
- **D-06:** Confirmation page shows order#/items/total/ETA/live status. On failure, guest retries on the SAME order (new PaymentIntent). Double-charge guard required: cancel/check prior PI before creating new one.
- **D-07:** Schema + Order aggregate redesign is the FIRST slice. Current `payments` table is inadequate (no `refunded_amount`, no Refund ids, no `stripe_account_id`, no SCA state).
- **D-08:** Add `requires_action` SCA/3DS intermediate state to Order aggregate: `created → requires_action → paid`.
- **D-09:** Stripe idempotency keys on every PaymentIntent and Refund creation call.
- **D-10:** Fastify raw-body capture on Stripe route; `stripe.webhooks.constructEvent` signature verification; 400 on bad sig; idempotency via `runDeduped` keyed on Stripe event id.
- **D-11:** Handle `charge.dispute.created` minimally: record + notify operator.
- **D-12:** Server-side "can this tenant/brand accept money?" predicate at checkout (not just UI gating).
- **D-13:** GNOTIF reuses Resend transport; GNOTIF-01 (confirmation) + GNOTIF-03 (refund) fire from Phase 8 events; GNOTIF-02 (accepted/ready) machinery built in Phase 8, fires from Phase 10 transitions.
- **D-14:** PAY-12 is ~80% built. Only delta: `outbox.is_leader` OTel gauge (1/0), false-negative fix for never-dispatched leader, reconcile "30s" vs 60_000ms default.

### Claude's Discretion

- Exact Stripe SDK version + adapter shape (mirror Resend adapter's retry/timeout/idempotency pattern)
- PaymentIntent confirmation flow (Payment Element vs hosted)
- account_link refresh/return URL handling
- How KYC capability predicate is cached
- Refund/dispute event → order-state mapping details
- Email template engine + per-locale structure

### Deferred Ideas (OUT OF SCOPE)

- SaaS subscription billing
- Multi-currency per tenant/brand
- `payments:refund` permission / manager break-glass
- Per-market fiscalization (bounded deferral — document launch market + why safe for first cohort)
- Disputes beyond record+notify (evidence submission UX, auto-refund-on-loss)
- Telegram / other payment channels
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID        | Description                                                                                    | Research Support                                                                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PAY-01    | Stripe SDK installed; `StripeConnectAdapter` implements `StripeConnectPort`                    | SDK: `stripe@22.3.0` (verified npm registry). Port needs expansion from 1 method to full payments surface.                                                            |
| PAY-02    | Operator initiates Stripe Connect onboarding from admin (`POST /v1/tenancy/stripe-onboarding`) | `stripe.accounts.create({ type: 'express', capabilities: { card_payments: { requested: true }, transfers: { requested: true } } })`                                   |
| PAY-03    | Stripe `account_link` generated; operator redirected to Stripe-hosted onboarding               | `stripe.accountLinks.create({ account, type: 'account_onboarding', return_url, refresh_url })`                                                                        |
| PAY-04    | Webhook endpoint validates Stripe signature; rejects invalid signatures with 400               | `stripe.webhooks.constructEvent(rawBody, sig, secret)` throws `Stripe.errors.StripeSignatureVerificationError` on bad sig. Fastify raw-body parser required.          |
| PAY-05    | `account.updated` webhook updates onboarding status                                            | Check `charges_enabled` + `payouts_enabled` + `requirements.currently_due` from Account object                                                                        |
| PAY-06    | PaymentIntent created as direct charge on connected account                                    | `stripe.paymentIntents.create({ amount, currency, application_fee_amount: configValue }, { stripeAccount: tenantStripeAccountId })` — NOT `transfer_data.destination` |
| PAY-07    | `payment_intent.succeeded` transitions order to `paid`                                         | `runDeduped` keyed on Stripe event id; webhook is sole writer of `paid` state                                                                                         |
| PAY-08    | `payment_intent.payment_failed` surfaces failure to guest                                      | Webhook transitions order to `failed`; guest UI reads status via polling                                                                                              |
| PAY-09    | Refund flow creates Stripe refund + transitions order to `refunded` (full or partial)          | `stripe.refunds.create({ payment_intent, amount?, reason }, { idempotencyKey, stripeAccount })`                                                                       |
| PAY-10    | Webhook handler idempotent (inbox dedup on Stripe event id)                                    | `runDeduped(db, stripeEventEnvelope, 'stripe-webhook', tx => ...)` guards DB writes. External calls (refund, email) need separate idempotency keys.                   |
| PAY-11    | `stripeAccountId` Zod schema gets `.max(255)`                                                  | Trivial schema constraint                                                                                                                                             |
| PAY-12    | `outbox.is_leader` OTel gauge; `/health/readiness` marks NOT ready when leader idle >30s       | `meter.createObservableGauge('outbox.is_leader')`. Fix `null` → false-negative. Reconcile threshold default.                                                          |
| PAY-13    | KYC-pending state does not block rest of product; only live switch is gated                    | Server-side `charges_enabled` check at PaymentIntent creation (not just UI)                                                                                           |
| SITE-08   | Guest sees order confirmation page after payment success                                       | New route in `apps/website`; polls `GET /v1/orders/:id/status` (ORDINT-10 stub needed)                                                                                |
| GNOTIF-01 | Guest receives order confirmation email after `payment_intent.succeeded`                       | New `GuestEmailAdapterPort` method; Resend transport reused                                                                                                           |
| GNOTIF-02 | Guest receives status emails when order transitions to `accepted`/`ready`                      | Email machinery in Phase 8; fires from Phase 10 transitions via `OrderStatusChanged` event                                                                            |
| GNOTIF-03 | Guest receives refund confirmation email                                                       | Fires from refund webhook handler                                                                                                                                     |
| GNOTIF-04 | Email templates respect brand theme (logo, accent color); per-locale                           | Simple `{{brandLogo}}` / `{{accentColor}}` / `{{locale}}` substitution in template strings (extend existing `fill()` pattern from `resend.adapter.ts`)                |

</phase_requirements>

---

## Summary

Phase 8 activates the real Stripe Connect money path that has been scaffolded since Phase 7. The core insight from persona reviews is that this is NOT just "replace the Noop adapter" — it requires a schema + aggregate redesign as the first slice, then the adapter, then the webhook surface, then guest notifications.

**Direct charges (D-02)** are the correct charge topology for RestOS: the connected restaurant account is merchant-of-record, bears Stripe processing fees and dispute liability, and the guest's card statement shows the restaurant's name. This is implemented by passing `{ stripeAccount: tenantStripeAccountId }` as the second argument to all Stripe API calls — not via `transfer_data.destination`. This resolves the CTO/skeptic BLOCK and is semantically correct for D-01 (restaurant bears fees) and D-11 (dispute liability on restaurant, not platform).

The **`payments` table redesign** is the most critical structural change. Current table has a single nullable `provider_payment_id`, no `refunded_amount`, no Refund ids, no SCA state, and no `stripe_account_id`. At minimum: add `paymentIntentId`, `latestChargeId`, `refundedAmount` (money, default 0), `stripeAccountId`, `applicationFeeAmount`; add a `payment_refunds` child table (one row per Stripe refund); widen `payments.status` to include `requires_action` + `partially_refunded`. The `Order` aggregate `refund()` method is full-only today and must support partial.

The **webhook raw-body problem** is a known Fastify+Stripe footgun. Fastify pre-parses JSON before NestJS sees it; `stripe.webhooks.constructEvent` requires the exact raw bytes. The fix is a Fastify `addContentTypeParser` scoped to `/webhook/stripe` registered before NestJS routing — same pattern as the BA preHandler hook in `security.ts`. This route must also be exempt from `@TenantContextMiddleware` and from the per-IP rate-limit bucket (Stripe has no `Origin` header and may retry).

The **Resend adapter** (`resend.adapter.ts`) is the exact template for the Stripe adapter: bounded retry budget with jitter (4 attempts, <6s), hard `Promise.race` timeout, idempotency keys on SDK calls, retryable vs terminal classification, terminal-failure emission to outbox. Clone this shape.

**Primary recommendation:** Build in this order: (1) migration + schema redesign + aggregate partial-refund + SCA state, (2) `StripeConnectAdapter` with the full port surface, (3) webhook handler with raw-body + signature + `runDeduped`, (4) confirmation page stub + order status poll endpoint, (5) guest email surface.

---

## Architectural Responsibility Map

| Capability                                     | Primary Tier          | Secondary Tier   | Rationale                                                                                         |
| ---------------------------------------------- | --------------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| Connect account creation + account_link        | API / Backend         | —                | Server-only: Stripe secret key, never client                                                      |
| PaymentIntent creation (direct charge)         | API / Backend         | —                | Server-side; secret key + tenant scoping required                                                 |
| Stripe.js payment confirmation (3DS challenge) | Browser / Client      | —                | `stripe.confirmPayment()` runs in guest browser; handles `requires_action` redirect automatically |
| Webhook ingestion + signature verification     | API / Backend         | —                | Server-only: webhook secret, raw body required                                                    |
| Order state transitions (paid/failed/refunded) | API / Backend         | —                | Authoritative state lives in DB; webhook is sole writer of `paid`                                 |
| Refund creation                                | API / Backend         | —                | Owner-only operator action; secret key required                                                   |
| KYC capability predicate                       | API / Backend         | —                | Must be server-enforced at PaymentIntent creation, not just UI                                    |
| `account.updated` capability sync              | API / Backend         | —                | Webhook → update `charges_enabled`/`payouts_enabled` on tenant row                                |
| Order confirmation page                        | Frontend Server (SSR) | Browser / Client | Next.js page in `apps/website`; polls order status                                                |
| Guest email dispatch (GNOTIF)                  | API / Backend         | —                | Fired from webhook handler via Resend adapter; brand-theming data from DB                         |
| `outbox.is_leader` OTel gauge (PAY-12)         | API / Backend         | —                | In-process metric; existing `OutboxDispatcherService`                                             |

---

## Standard Stack

### Core

| Library  | Version  | Purpose                  | Why Standard                                                                                                               |
| -------- | -------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `stripe` | `22.3.0` | Official Stripe Node SDK | Maintained by Stripe; includes TypeScript types, idempotency key support, webhook signature verification, all Connect APIs | [VERIFIED: npm registry, github.com/stripe/stripe-node, published 2026-06-24] |

### No Additional Libraries Needed

All other capabilities reuse existing project dependencies:

| Existing Package                                                    | Reused For                                                                          |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `resend` (via `resend.adapter.ts`)                                  | Guest email transport (GNOTIF)                                                      |
| `packages/events` (`runDeduped`, `buildEnvelope`, `appendToOutbox`) | Webhook idempotency + outbox                                                        |
| `packages/db` (Drizzle, `ScopedTx`)                                 | Payment/refund schema + queries                                                     |
| `@opentelemetry/api` (already in `outbox-dispatcher.service.ts`)    | `outbox.is_leader` gauge                                                            |
| `zod`                                                               | Env schema additions (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_APP_FEE_BPS) |

**Installation (new only):**

```bash
pnpm --filter @resto/api add stripe@22.3.0
```

---

## Package Legitimacy Audit

| Package  | Registry | Age       | Source Repo                   | slopcheck             | Disposition                                                                                                                                                                                                   |
| -------- | -------- | --------- | ----------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stripe` | npm      | ~11 years | github.com/stripe/stripe-node | not run (unavailable) | Approved — official Stripe SDK, maintainer = `stripe-bindings <dev-platform-bots@stripe.com>`, no postinstall script, homepage matches official GitHub, well-known package. [VERIFIED: npm registry + GitHub] |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

_slopcheck was unavailable at research time. `stripe` is verified via official GitHub repository (`github.com/stripe/stripe-node`), Stripe's own documentation, zero postinstall scripts, and long public history — treat as `[OK]` equivalent. All other packages are existing project dependencies._

---

## Architecture Patterns

### System Architecture Diagram

```
Guest Browser ──── POST /v1/orders ──────────────► API (ordering context)
                                                      │
                                                      ├─ create Order (status: created)
                                                      ├─ POST /v1/payments/checkout
                                                      │   ├─ check charges_enabled (D-12)
                                                      │   ├─ cancel prior PI if exists (D-06)
                                                      │   └─ stripe.paymentIntents.create(
                                                      │        { amount, currency, app_fee },
                                                      │        { stripeAccount: tenantAcctId }
                                                      │      )  ◄── direct charge (D-02)
                                                      │
                                                      └─ return { clientSecret } to browser

Guest Browser ──── Stripe.js confirmPayment() ──► Stripe
                   (handles requires_action 3DS)      │
                                                      │
                                                      └─ payment_intent.succeeded ──► POST /webhook/stripe
                                                                                          │
                                                                                          ├─ constructEvent (raw body)
                                                                                          ├─ 400 on bad sig
                                                                                          ├─ runDeduped(eventId)
                                                                                          │   ├─ order.markPaid()
                                                                                          │   └─ emit OrderPaid outbox
                                                                                          └─ (external, post-tx)
                                                                                              ├─ send GNOTIF-01 email
                                                                                              └─ return 200

Guest Browser ──── poll GET /v1/orders/:id/status ─► API ──► return current order status

Operator Admin ─── POST /v1/payments/refund ──────► API (ordering context)
                                                      ├─ check owner role (D-04)
                                                      ├─ stripe.refunds.create(
                                                      │    { payment_intent, amount?, reason },
                                                      │    { idempotencyKey, stripeAccount }
                                                      │  )
                                                      └─ update payment.refundedAmount + emit OrderRefunded

Stripe ────────── charge.dispute.created ─────────► POST /webhook/stripe
                                                      ├─ runDeduped(eventId)
                                                      ├─ record dispute in payments table
                                                      └─ notify operator via Resend

Stripe ────────── account.updated ───────────────► POST /webhook/stripe
                                                      ├─ runDeduped(eventId)
                                                      └─ update tenant.stripeChargesEnabled/PayoutsEnabled
```

### Recommended Project Structure

New files/directories only (existing contexts untouched except for expansions):

```
apps/api/src/contexts/
├── ordering/
│   ├── domain/
│   │   ├── order.aggregate.ts       # add: markRequiresAction(), refund(amount) partial, markDisputed()
│   │   └── ports.ts                 # expand PaymentPort with full payments surface
│   ├── application/
│   │   ├── create-payment.service.ts       # create PI + idempotency key
│   │   ├── confirm-webhook.service.ts      # handle payment_intent.succeeded/failed
│   │   ├── refund-order.service.ts         # owner refund (full + partial)
│   │   └── dispute-handler.service.ts      # charge.dispute.created
│   └── infrastructure/
│       └── stripe-payment.adapter.ts       # StripeConnectAdapter real implementation
├── tenancy/
│   ├── application/
│   │   └── stripe-onboarding.service.ts    # create account + account_link
│   └── infrastructure/
│       └── stripe-connect.adapter.ts       # REPLACE NoopStripeConnectAdapter
└── notifications/                          # NEW context (or expand identity/email)
    ├── domain/
    │   └── ports.ts                        # GuestEmailAdapterPort (new methods)
    └── infrastructure/
        └── guest-email.adapter.ts          # wraps ResendEmailAdapter + brand theming

apps/api/src/interfaces/http/
└── webhook/
    └── stripe-webhook.controller.ts        # POST /webhook/stripe, @Public(), raw body

apps/website/
└── app/orders/[orderId]/
    └── page.tsx                            # SITE-08 confirmation page with status poll

packages/db/src/schema/
└── ordering.ts                             # EXPAND: payments table + payment_refunds table

packages/db/migrations/
└── 0055_payments_redesign.sql              # migration for schema changes
```

### Pattern 1: Direct Charge on Connected Account

**What:** PaymentIntent created on the platform's Stripe instance but routed to the connected account via `stripeAccount` option. The connected account is merchant-of-record.

**When to use:** Every checkout in RestOS (D-02).

```typescript
// Source: docs.stripe.com/connect/charges (CITED)
// In StripeConnectAdapter:
const paymentIntent = await this.#stripe.paymentIntents.create(
  {
    amount: totalMinorUnits, // integer, smallest currency unit
    currency: tenantCurrency.toLowerCase(),
    // application_fee_amount: config value (default 0) — keeps lever open (D-03)
    application_fee_amount:
      this.#applicationFeeBps > 0
        ? Math.round((totalMinorUnits * this.#applicationFeeBps) / 10000)
        : 0,
    metadata: { orderId, tenantId }, // for reconciliation
    // Do NOT add transfer_data — that would make it a destination charge
  },
  {
    stripeAccount: stripeConnectedAccountId, // the connected Express account
    idempotencyKey: `pi:${orderId}:${attemptNumber}`, // D-09
  },
);
// Returns: { id: 'pi_xxx', client_secret: 'pi_xxx_secret_yyy', status: 'requires_payment_method' }
```

**Key semantic facts (CITED: docs.stripe.com/connect/charges):**

- Connected account is merchant-of-record (restaurant's name on guest card statement)
- Connected account pays Stripe processing fees (NOT the platform)
- Dispute/chargeback liability sits on the connected account
- `application_fee_amount` flows from connected account → platform (default 0 per D-03)

### Pattern 2: SCA / 3DS Handling (D-08)

**What:** When Stripe requires Strong Customer Authentication (EU cards), the PaymentIntent enters `requires_action` status. The guest browser must handle the challenge.

**State machine (CITED: docs.stripe.com/payments/payment-intents/verifying-status):**

```
created (Order) → requires_action (new OrderStatus) → paid
                                                     ↘ failed (if challenge rejected)
```

**Server creates PI, returns `client_secret` to browser:**

```typescript
// API response to POST /v1/payments/checkout:
return { paymentIntentId: pi.id, clientSecret: pi.client_secret };
```

**Browser handles 3DS automatically via Stripe.js (CITED):**

```typescript
// apps/website: client-side
const { paymentIntent, error } = await stripe.confirmPayment({
  elements, // Stripe Payment Element
  confirmParams: {
    return_url: `${origin}/orders/${orderId}`, // SITE-08 confirmation page
  },
  redirect: 'if_required', // only redirects for 3DS, otherwise resolves immediately
});
// Stripe.js handles requires_action automatically before the promise resolves
```

**Order status during SCA (new state needed in aggregate + schema):**

- After PI creation: order status stays `created`, payment row status = `requires_action`
- After Stripe challenge: `payment_intent.succeeded` webhook → `markPaid()`
- `requires_action` does NOT need to be a full Order status — it only needs to be in `payments.status` to survive webhook ordering

### Pattern 3: Webhook Raw-Body + Signature Verification (D-10)

**What:** Fastify parses JSON before NestJS sees it. Stripe signature verification requires exact raw bytes. Must be registered before NestJS routing.

**CTO HIGH finding (BLOCK if not done):**

```typescript
// In registerSecurity() or a dedicated Fastify plugin, registered BEFORE app.init():
// Source: CTO persona review + docs.stripe.com/webhooks [CITED]
fastify.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  (req, body, done) => {
    // Only capture raw for webhook route; parse normally elsewhere
    if (req.url === '/webhook/stripe') {
      (req as FastifyRequest & { rawBody: Buffer }).rawBody = body;
      done(null, body); // pass Buffer, not parsed object
    } else {
      done(null, JSON.parse(body.toString('utf-8')));
    }
  },
);
```

**Webhook controller:**

```typescript
// apps/api/src/interfaces/http/webhook/stripe-webhook.controller.ts
@Public() // bypass AuthGuard
@SkipTenantContext() // bypass TenantContextMiddleware
@Controller('webhook')
export class StripeWebhookController {
  @Post('stripe')
  @HttpCode(200)
  async handleStripe(
    @Req() req: FastifyRequest,
    @Headers('stripe-signature') sig: string,
  ) {
    let event: Stripe.Event;
    try {
      // stripe.webhooks.constructEvent requires raw Buffer body (CITED: docs.stripe.com/webhooks)
      event = this.stripe.webhooks.constructEvent(
        (req as any).rawBody,
        sig,
        this.webhookSecret,
      );
    } catch (err) {
      // Returns Stripe.errors.StripeSignatureVerificationError on bad sig
      throw new BadRequestException('Invalid Stripe signature'); // 400
    }

    await this.webhookService.handle(event);
    return { received: true };
  }
}
```

**Signature tolerance:** Default 5 minutes (CITED: Stripe webhook docs). Do not set tolerance to 0.

**Rate limiting:** Stripe webhook route must be exempt from per-IP rate limit bucket (Stripe sends no `Origin` header and may burst on retry). Add to `registerSecurity()` allowlist or skip guard.

### Pattern 4: Idempotency Keys (D-09)

**What:** Every PI and Refund creation must carry an idempotency key so network retries don't double-charge.

**Key derivation (CITED: docs.stripe.com/api/idempotent_requests):**

- Max 255 chars, V4 UUID or deterministic string
- PI creation: `pi:${orderId}:${attemptNumber}` — when guest retries (D-06), increment `attemptNumber` (stored in `payments.attemptNumber` or derived from attempt count)
- Refund creation: `refund:${orderId}:${refundRequestId}` — `refundRequestId` is generated once per operator refund action and stored before the Stripe call

```typescript
// PI idempotency key pattern
const attempt = await this.getOrCreatePaymentAttempt(orderId); // returns attempt number
const idempotencyKey = `pi:${orderId}:${attempt}`;

// Refund idempotency key pattern — derive from a new UUID stored BEFORE the Stripe call
const refundRequestId = randomUUID();
await this.storeRefundRequest(orderId, refundRequestId, amount, reason); // DB write first
const refund = await this.stripe.refunds.create(
  { payment_intent: paymentIntentId, amount, reason },
  {
    idempotencyKey: `refund:${refundRequestId}`,
    stripeAccount: stripeAccountId,
  },
);
```

**Retry-on-same-order double-charge guard (D-06 — BLOCK if missing):**
Before creating a new PI, check for an existing PI in `payments` table for this order:

```typescript
const existingPayment = await this.paymentRepo.findActiveForOrder(orderId);
if (
  existingPayment?.paymentIntentId &&
  existingPayment.status !== 'succeeded'
) {
  // Cancel the prior PI before creating a new one
  await this.stripe.paymentIntents.cancel(
    existingPayment.paymentIntentId,
    {},
    { stripeAccount },
  );
}
```

This prevents a late-succeeding first PI from double-charging after the guest retried.

### Pattern 5: Refunds (Full + Partial) (D-04/D-09)

**CITED: docs.stripe.com/api/refunds/create**

```typescript
// Full refund
const refund = await stripe.refunds.create(
  { payment_intent: paymentIntentId, reason: 'requested_by_customer' },
  {
    idempotencyKey: `refund:${refundRequestId}`,
    stripeAccount: stripeAccountId,
  },
);

// Partial refund (amount in smallest currency unit)
const refund = await stripe.refunds.create(
  { payment_intent: paymentIntentId, amount: partialAmountMinor, reason },
  {
    idempotencyKey: `refund:${refundRequestId}`,
    stripeAccount: stripeAccountId,
  },
);
```

**Partial refund accumulation (CITED: Stripe refund docs):**

- `charge.amount_refunded` on the Charge object tracks total refunded so far
- Each `stripe.refunds.create()` creates a new Refund object with its own `id` (`re_xxx`)
- Stripe rejects if cumulative `amount` exceeds original charge amount
- `charge.refunded` (bool) = true when fully refunded

**Domain invariant needed:** `sum(payment_refunds.amount) ≤ payments.amount`. Enforce in refund service before calling Stripe.

**Webhook events fired on refund:**

- `charge.refunded` — charge object with updated `amount_refunded` and `refunded` flag
- `refund.updated` — individual refund object status changes

**Order status after partial refund:** Order stays `paid` (still active); `payments.status` → `partially_refunded`. Only full refund (or cancel) → Order `refunded`.

### Pattern 6: Connect Onboarding (PAY-02/03/05)

**CITED: docs.stripe.com/connect/express-accounts**

```typescript
// Step 1: Create Express account (once per tenant)
const account = await stripe.accounts.create({
  type: 'express',
  country: tenantCountry, // defaults to platform's country if omitted
  capabilities: {
    card_payments: { requested: true },
    transfers: { requested: true },
  },
  business_profile: { url: `https://${tenantSlug}.resto.app` },
});
// Store account.id in tenants.stripeAccountId

// Step 2: Create account_link (every time operator clicks "Complete onboarding")
const link = await stripe.accountLinks.create({
  account: stripeAccountId,
  type: 'account_onboarding',
  return_url: `${adminWebUrl}/dashboard/settings/payments?return=true`,
  refresh_url: `${adminWebUrl}/dashboard/settings/payments?refresh=true`,
});
// Redirect operator to link.url (expires in minutes — must be used immediately)
```

**`account.updated` webhook — KYC status update (PAY-05):**

```typescript
// account.updated event payload key fields (CITED: docs.stripe.com/connect/account-capabilities)
const account = event.data.object as Stripe.Account;
const chargesEnabled = account.charges_enabled; // boolean
const payoutsEnabled = account.payouts_enabled; // boolean
const currentlyDue = account.requirements?.currently_due ?? []; // string[]
const disabledReason = account.requirements?.disabled_reason; // string | null

// Persist to tenants table:
await tenantRepo.updateStripeStatus(tenantId, {
  stripeChargesEnabled: chargesEnabled,
  stripePayoutsEnabled: payoutsEnabled,
  stripeRequirementsCurrentlyDue: currentlyDue,
});
```

**"Can accept money?" predicate (D-12):**

```typescript
// Server-side check in create-payment.service.ts — not just UI
const tenant = await tenantRepo.findById(tenantId);
if (!tenant.stripeAccountId || !tenant.stripeChargesEnabled) {
  throw new PaymentNotAvailableError(tenantId);
}
```

### Pattern 7: Dispute Handling (D-11)

**CITED: docs.stripe.com/connect/charges — dispute liability for direct charges**

Under direct charges: disputed amount debits the **connected account's balance** (the restaurant's). The platform is NOT the insurer (unlike destination charges). This is why D-02 (direct charges) is correct — it isolates RestOS from dispute liability.

Minimal Phase 8 handling:

```typescript
// charge.dispute.created webhook handler
case 'charge.dispute.created': {
  const dispute = event.data.object as Stripe.Dispute;
  // 1. Record dispute in DB (new disputes table or payments.disputeId column)
  await disputeRepo.create({ chargeId: dispute.charge, reason: dispute.reason, amount: dispute.amount });
  // 2. Notify operator via Resend (existing transport)
  await this.guestEmailAdapter.sendDisputeAlert({ tenantId, disputeAmount: dispute.amount });
  break;
}
```

### Anti-Patterns to Avoid

- **Using `transfer_data.destination` instead of `{ stripeAccount }` option:** Destination charges make the platform merchant-of-record and fee-payer — contradicts D-01/D-02.
- **Skipping raw-body capture for webhook route:** `stripe.webhooks.constructEvent` will fail with `StripeSignatureVerificationError` on every request, or someone "fixes" it by skipping verification.
- **`runDeduped` for external side effects:** `runDeduped` only deduplicates DB writes. The Stripe refund call and email sends are external — must carry their own idempotency keys (D-09, ADR-0020 I-5b).
- **Both browser return AND webhook writing `paid`:** `markPaid()` throws `InvalidOrderTransitionError` if status ≠ `created`. Webhook is the ONLY writer of `paid`. Confirmation page polls read-only.
- **`stripe_account_id` on `brands` and `tenants` both populated:** Declare tenant as the sole Connect account holder for MVP (D-05); leave `brands.stripe_account_id` as reserved/null.
- **Hardcoding `application_fee_amount: 0`:** Must be config-driven (D-03).
- **Calling `stripe.paymentIntents.create()` without idempotency key:** On network timeout, retry creates a second PI → double-charge.

---

## Don't Hand-Roll

| Problem                                | Don't Build                         | Use Instead                                                  | Why                                                                                                          |
| -------------------------------------- | ----------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Webhook signature verification         | Custom HMAC check                   | `stripe.webhooks.constructEvent(rawBody, sig, secret)`       | Stripe uses a timestamped signature with replay protection; hand-rolled HMAC misses the `t=` timestamp check |
| Payment method collection + 3DS UI     | Custom card form                    | Stripe.js Payment Element with `stripe.confirmPayment()`     | PCI scope, 3DS/SCA handling, browser fingerprinting — all handled by Stripe; never touch raw card data       |
| Connect onboarding KYC form            | Custom identity form                | `stripe.accountLinks.create({ type: 'account_onboarding' })` | KYC is Stripe's legal responsibility in Express model                                                        |
| Idempotency key generation for retries | UUID per retry                      | Deterministic `pi:${orderId}:${attempt}`                     | Same key = same result; new UUID per retry defeats the purpose                                               |
| Refund accounting                      | Running total in application memory | `payment_refunds` table with domain invariant                | `sum(refunds) ≤ captured` must survive crashes and concurrent requests                                       |
| 3DS challenge UI                       | Custom redirect handling            | `stripe.confirmPayment({ redirect: 'if_required' })`         | Handles all `requires_action` types automatically (redirect, SDK, iframe)                                    |

**Key insight:** Stripe handles all PCI-scoped operations. RestOS never touches raw card data — it only stores PaymentIntent IDs and Charge IDs, which are non-sensitive identifiers.

---

## Schema Redesign (D-07) — Gap Analysis

### Current `payments` table — gaps

| Column                   | Current                                 | Needed                                           | Delta                                                |
| ------------------------ | --------------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| `provider_payment_id`    | nullable text, unique on (provider, id) | `payment_intent_id` text NOT NULL after creation | Rename + make non-null at flow completion            |
| Status values            | `pending, succeeded, failed, refunded`  | + `requires_action`, `partially_refunded`        | Widen CHECK constraint                               |
| `refunded_amount`        | missing                                 | `money` column DEFAULT '0.00'                    | Add                                                  |
| `stripe_account_id`      | missing                                 | text, populated from tenant                      | Add (for reconciliation)                             |
| `application_fee_amount` | missing                                 | `money` DEFAULT '0.00'                           | Add (for FIN phase, fee-as-config D-03)              |
| `latest_charge_id`       | missing                                 | text nullable                                    | Add (needed for refund via charge, dispute tracking) |
| Refund records           | none                                    | `payment_refunds` child table                    | New table                                            |

### New `payment_refunds` table (must follow ADR-0020 I-2)

```sql
CREATE TABLE payment_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL,
  -- Composite FK per ADR-0020 I-2:
  FOREIGN KEY (payment_id, tenant_id) REFERENCES payments(id, tenant_id),
  stripe_refund_id TEXT NOT NULL,           -- re_xxx
  amount NUMERIC(12,2) NOT NULL,
  reason TEXT NOT NULL,                      -- owner-provided reason (D-04)
  status TEXT NOT NULL DEFAULT 'pending',   -- pending, succeeded, failed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- CHECK constraint: status IN ('pending', 'succeeded', 'failed')
-- Unique: (tenant_id, stripe_refund_id) — dedup on webhook replay
```

### `Order` aggregate changes needed

| Method                 | Current                                    | Delta                                                                                                                                                 |
| ---------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `markPaid(paymentId)`  | requires `created` → `paid`                | Also allow `created` with `requires_action` intermediate; still only one path to `paid`                                                               |
| `markRequiresAction()` | missing                                    | New method: `created → requires_action` intermediate (payment status only, optional)                                                                  |
| `refund(amount?)`      | full-only, hardcodes `toMinorUnits(total)` | Accept optional `amount` param; if `amount < total` → status stays `paid`, emit `OrderPartiallyRefunded`; if `amount === total` → status → `refunded` |
| `markFailed(reason)`   | already exists                             | No change needed                                                                                                                                      |

### Tenant aggregate changes needed

```typescript
// Add to TenantSnapshot:
stripeChargesEnabled: boolean;    // from account.updated
stripePayoutsEnabled: boolean;    // from account.updated
stripeRequirementsCurrentlyDue: string[];  // for "what's missing" admin UX
```

### Per-brand vs per-tenant reconciliation (D-05)

Both `tenants.stripeAccountId` and `brands.stripeAccountId` exist in schema. Decision: **tenant is the sole Connect account holder for MVP**. `brands.stripeAccountId` remains nullable/null. At checkout, read `stripeAccountId` from the tenant row (resolved via `TenantContextMiddleware` ALS). Document `brands.stripeAccountId` as reserved for future per-brand payments (MVP-3).

---

## PAY-12 Delta (D-14) — Only 3 Items

The outbox leader health infrastructure is already shipped (07.5-03). Confirmed by direct code read:

- `OutboxDispatcherService.getOutboxLeaderHealth()` exists (`outbox-dispatcher.service.ts:91-99`)
- `/readyz` stale-leader drain exists (`health.controller.ts:94-111`)
- Leader election via advisory lock exists

**Remaining delta only:**

1. **`outbox.is_leader` OTel gauge (10 lines):**

```typescript
// In OutboxDispatcherService constructor, after existing meters:
private readonly isLeaderGauge = this.meter.createObservableGauge('outbox.is_leader', {
  description: 'Whether this instance is the outbox leader (1=yes, 0=no)',
});

// In onApplicationBootstrap() or a separate method called after lock acquisition:
this.isLeaderGauge.addCallback((result) => {
  result.observe(this.isLeader() ? 1 : 0);
});
```

2. **False-negative fix for never-dispatched leader (CTO MED finding):**
   Current: `staleMs = null` when `lastDispatchAt = null` → `/readyz` treats as healthy (line 103: `staleMs !== null && staleMs > threshold`).
   Fix: treat `isLeader && lastDispatchAt === null && (Date.now() - leaderAcquiredAt) > threshold` as stale. Add `leaderAcquiredAt: Date | null` field.

3. **Reconcile 30s vs 60_000ms default:**
   `OUTBOX_STALL_THRESHOLD_MS` defaults to `60_000` (`env.schema.ts:49`). PAY-12 spec says ">30s". Either update the requirement text to ">60s" or change the default to `30_000`. **Recommendation:** change `env.schema.ts` default to `30_000` — 30s is tighter and pays orders justify lower latency tolerance.

---

## Common Pitfalls

### Pitfall 1: Destination Charge Instead of Direct Charge

**What goes wrong:** `stripe.paymentIntents.create({ transfer_data: { destination: acct_xxx } })` — platform becomes merchant-of-record, platform pays Stripe fees, platform bears disputes. With `application_fee = 0`, RestOS subsidizes every restaurant's processing costs.

**Why it happens:** PAY-06 requirement text originally said "destination"; the CONTEXT.md resolved this to direct charges (D-02) but the wording survives in the requirements file.

**How to avoid:** Use `{ stripeAccount: acct_xxx }` as the **second argument** to `paymentIntents.create()`. No `transfer_data`. No `on_behalf_of`. The `stripeAccount` option is what routes the charge to the connected account as a direct charge.

**Warning signs:** If the charge appears in the platform Stripe dashboard (not the connected account's dashboard), it's a destination charge.

### Pitfall 2: Fastify JSON Pre-Parsing Breaking Webhook Signature

**What goes wrong:** Fastify parses the JSON body before NestJS routing; `stripe.webhooks.constructEvent` receives a re-serialized string that doesn't byte-match the original → every webhook returns 400.

**Why it happens:** `@fastify/cors`, `@fastify/helmet` and NestJS's default JSON parser both run before the controller receives the request.

**How to avoid:** Register a `addContentTypeParser('application/json', { parseAs: 'buffer' })` handler in Fastify scoped to `/webhook/stripe` that stores the raw Buffer. Register this BEFORE `registerSecurity()` in `main.ts`.

**Warning signs:** `StripeSignatureVerificationError: No signatures found matching the expected signature for payload` on every webhook.

### Pitfall 3: `runDeduped` False Confidence on External Calls

**What goes wrong:** Handler has `runDeduped` → DB state transitions are idempotent. But the Stripe refund call and Resend email inside the same handler are NOT covered. Redelivered webhook → second refund attempt (potentially fails with "already refunded") + second email.

**Why it happens:** `run-deduped.ts:27-31` explicitly documents this: "This helper does NOT guard external side effects." It only guarantees the inbox marker + handler DB writes commit atomically.

**How to avoid:** (a) Stripe refund idempotency: pass `idempotencyKey` to `stripe.refunds.create()`. Stripe returns the same refund object on replay — idempotent. (b) Email dedup: check a `guest_emails_sent` table or use the Stripe event id as the Resend idempotency key (`idempotencyKey: event.id`).

### Pitfall 4: Double-Charge on "Retry Same Order"

**What goes wrong:** Guest's PI is slow (3DS, bank latency); UI times out; guest clicks "pay again"; a second PI is created; the first PI then succeeds → two charges on the same order.

**Why it happens:** `markPaid()` throws if status ≠ `created`, but that only blocks the second WEBHOOK — the second CHARGE exists at Stripe and funds are already debited.

**How to avoid:** Before creating a new PI, read `payments` table for this order. If an active (non-failed) PI exists, call `stripe.paymentIntents.cancel(existingPiId, {}, { stripeAccount })` first. Store the attempt number so idempotency keys are distinct per attempt.

### Pitfall 5: Webhook Before Browser Return (SITE-08 Race)

**What goes wrong:** `payment_intent.succeeded` arrives and is processed (outbox → inbox → markPaid) before the guest's browser redirects to the confirmation page. But the outbox dispatch is async (dispatch loop interval). Guest lands on confirmation page, polls status, sees `created` for several seconds.

**Why it happens:** Outbox dispatch is not instantaneous; there's latency between the webhook handler committing to outbox and the event being published to NATS and processed by the GNOTIF subscriber.

**How to avoid:** SITE-08 confirmation page MUST poll `GET /v1/orders/:id/status` with backoff (e.g., 500ms, 1s, 2s, max 10s) rather than expecting instant `paid` on first load. This endpoint is a thin DB read — low-cost, can be implemented in Phase 8 as a stub of ORDINT-10.

### Pitfall 6: account_link Expiry

**What goes wrong:** `stripe.accountLinks.create()` returns a URL valid for only a few minutes. If the operator doesn't click immediately, the link fails. They must go back to admin and click "Complete onboarding" again.

**How to avoid:** Use `refresh_url` to regenerate a new account_link when the old one expires. The `refresh_url` handler should call `stripe.accountLinks.create()` again with the same parameters and redirect.

---

## Code Examples

### Creating a Direct Charge PaymentIntent

```typescript
// Source: docs.stripe.com/connect/charges [CITED]
// apps/api/src/contexts/ordering/infrastructure/stripe-payment.adapter.ts

const paymentIntent = await this.#stripe.paymentIntents.create(
  {
    amount: totalMinorUnits, // e.g., 1500 for €15.00
    currency: currency.toLowerCase(), // e.g., 'eur'
    application_fee_amount: this.#computeAppFee(totalMinorUnits), // config, default 0
    metadata: {
      order_id: orderId,
      tenant_id: tenantId,
    },
  },
  {
    stripeAccount: stripeConnectedAccountId, // Direct charge: key param
    idempotencyKey: `pi:${orderId}:${attemptNumber}`, // D-09
  },
);
// client_secret returned to browser for Stripe.js confirmPayment()
```

### Webhook Handler Structure

```typescript
// Source: Stripe webhook docs [CITED] + runDeduped pattern [VERIFIED: codebase]
// apps/api/src/contexts/ordering/infrastructure/stripe-webhook.handler.ts

@Injectable()
export class StripeWebhookHandler {
  async handle(db: TenantAwareDb, event: Stripe.Event): Promise<void> {
    // Construct a synthetic envelope so runDeduped can key on the Stripe event id
    const envelope = buildEnvelope(StripeEventV1, { stripeEventId: event.id }, { tenantId: null });

    await runDeduped(db, { ...envelope, id: event.id }, 'stripe-webhook', async (tx) => {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSucceeded(tx, event.data.object as Stripe.PaymentIntent);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentFailed(tx, event.data.object as Stripe.PaymentIntent);
          break;
        case 'charge.refunded':
          await this.handleChargeRefunded(tx, event.data.object as Stripe.Charge);
          break;
        case 'charge.dispute.created':
          await this.handleDisputeCreated(tx, event.data.object as Stripe.Dispute);
          break;
        case 'account.updated':
          await this.handleAccountUpdated(tx, event.data.object as Stripe.Account);
          break;
      }
    });

    // External side effects AFTER the transaction (D-10 note: not covered by runDeduped)
    // Email sends use event.id as idempotency key to prevent duplicates
    if (event.type === 'payment_intent.succeeded') {
      await this.guestEmailAdapter.sendOrderConfirmation(
        { orderId: ..., idempotencyKey: `gnotif-confirm:${event.id}` }
      );
    }
  }
}
```

### Resend Adapter Template for Stripe Adapter

The `resend.adapter.ts` pattern to clone:

- `RETRY_DELAYS_MS = [0, 250, 1000, 4000]` — 4 attempts, total <6s
- `SEND_TIMEOUT_MS = 5500` — hard `Promise.race` timeout
- Idempotency key passed to SDK call options
- Terminal 4xx: don't retry; emit failure event to outbox
- Retryable 5xx + network errors: retry within budget
- Classified by `isRetryable(statusCode)` helper

For Stripe adapter, map:

- 4xx (400, 402, 404) → terminal (bad params, card declined, resource not found)
- 429 → terminal (rate-limit — wait for retry via webhook, don't loop)
- 5xx → retryable within budget
- Network timeout → retryable (but idempotency key prevents double-charge)

### Guest Email Template Pattern

Extend the existing `fill()` function from `resend.adapter.ts`:

```typescript
// New email methods needed in GuestEmailAdapterPort:
sendOrderConfirmation(input: {
  to: string;
  locale: 'en' | 'ru';
  orderId: string;
  orderNumber: string;
  items: OrderItemSummary[];
  total: string;
  currency: string;
  brandLogoUrl: string | null;
  brandAccentColor: string;
  idempotencyKey: string;
}): Promise<void>;

sendRefundConfirmation(input: { ... }): Promise<void>;
sendOrderStatusChanged(input: { ... }): Promise<void>;  // GNOTIF-02, wired in Phase 10
```

Template approach: plain-text `{{variable}}` substitution (same `fill()` from `resend.adapter.ts`) with locale-specific strings. One template file per email type per locale. HTML templates deferred (adds complexity, plain text works for MVP). Brand theming: inline `{{brandName}}` + `{{brandAccentColor}}` in subject/body; `{{brandLogoUrl}}` in HTML if/when HTML templates are added.

---

## State of the Art

| Old Approach                                       | Current Approach                                                         | When Changed             | Impact                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------ |
| `stripe.charges.create()` with `source` token      | `stripe.paymentIntents.create()` + Stripe.js `confirmPayment()`          | 2018 (SCA mandate)       | PaymentIntents are the only correct API for EU payments; Charges API is legacy |
| `transfer_data.destination` for restaurant payouts | Direct charges via `{ stripeAccount }` option                            | Decision D-02 this phase | Correct fee/liability ownership                                                |
| `NoopStripeConnectAdapter` (1 method)              | Full `StripeConnectPort` with onboarding + PI + refund + webhook surface | Phase 8                  | The real adapter                                                               |

**Deprecated/outdated in this codebase:**

- `payments.provider_payment_id` column: rename to `payment_intent_id` and add `latest_charge_id`
- `Order.refund()` hardcoded full-only: extend to accept optional `amount`
- `StripeConnectPort.ensureExpressAccount()`: insufficient — port needs expansion
- Comments in `stripe-connect.adapter.ts` citing "MVP-2 / ADR-0009/0010/0012": all wrong — strip on touch

---

## Environment Availability

| Dependency                        | Required By                    | Available         | Version       | Fallback                                   |
| --------------------------------- | ------------------------------ | ----------------- | ------------- | ------------------------------------------ |
| `stripe` npm package              | PAY-01..09, GNOTIF             | Not yet installed | Need `22.3.0` | None — must install                        |
| Stripe CLI                        | Local webhook testing          | Not found locally | Need install  | Cloudflare Tunnel (free) — both acceptable |
| STRIPE_SECRET_KEY (test mode)     | All Stripe SDK calls           | Not in `.env`     | —             | None — must provision test keys            |
| STRIPE_WEBHOOK_SECRET             | Webhook signature verification | Not in `.env`     | —             | None — from `stripe listen` output         |
| STRIPE_APP_FEE_BPS                | Fee config (D-03)              | Not in env schema | —             | Default 0 (must add to env.schema.ts)      |
| Docker dev stack (Postgres, NATS) | Outbox/inbox, DB migrations    | Assumed running   | `pnpm dev:up` | None for dev                               |
| MailHog                           | Email testing (existing)       | Assumed running   | —             | —                                          |

**Missing dependencies with no fallback:**

- `stripe` npm package (install before any other work)
- Stripe test-mode API keys (obtain from Stripe dashboard before any webhook testing)

**Missing dependencies with fallback:**

- Stripe CLI: `stripe listen --forward-to localhost:3000/webhook/stripe` — can use Cloudflare Tunnel alternatively

**Stripe CLI installation:**

```bash
# macOS
brew install stripe/stripe-cli/stripe
# Then authenticate:
stripe login
# Listen for webhooks:
stripe listen --forward-to localhost:3000/webhook/stripe
```

---

## Validation Architecture

### Test Framework

| Property    | Value                                           |
| ----------- | ----------------------------------------------- |
| Framework   | Vitest 2.1.8 + NestJS testing module (existing) |
| Config file | `apps/api/vitest.config.ts` (existing)          |
| Quick run   | `pnpm nx test api --testPathPattern=stripe`     |
| Full suite  | `pnpm nx test api`                              |
| e2e suite   | `pnpm nx e2e api`                               |

### Phase Requirements → Test Map

| Req ID    | Behavior                                                        | Test Type                   | Automated Command                                      | File Exists? |
| --------- | --------------------------------------------------------------- | --------------------------- | ------------------------------------------------------ | ------------ |
| PAY-04    | Webhook rejects bad signature with 400                          | unit                        | `pnpm nx test api --testPathPattern=stripe-webhook`    | ❌ Wave 0    |
| PAY-04    | Webhook accepts valid signature                                 | unit                        | same                                                   | ❌ Wave 0    |
| PAY-07    | `payment_intent.succeeded` → order `paid` (idempotent replay)   | unit                        | same                                                   | ❌ Wave 0    |
| PAY-09    | Partial refund accounting: `sum(refunds) ≤ captured`            | unit                        | `pnpm nx test api --testPathPattern=refund`            | ❌ Wave 0    |
| PAY-10    | Duplicate webhook event is no-op                                | unit (with runDeduped stub) | `pnpm nx test api --testPathPattern=stripe-webhook`    | ❌ Wave 0    |
| PAY-12    | `outbox.is_leader` gauge emits 1 when leader                    | unit                        | `pnpm nx test api --testPathPattern=outbox-dispatcher` | ❌ Wave 0    |
| D-02      | Direct charge uses `stripeAccount` option (NOT `transfer_data`) | unit mock                   | `pnpm nx test api --testPathPattern=stripe-payment`    | ❌ Wave 0    |
| D-06      | Prior PI cancelled before new PI creation on retry              | unit mock                   | same                                                   | ❌ Wave 0    |
| D-09      | Idempotency key is deterministic across retries                 | unit                        | same                                                   | ❌ Wave 0    |
| GNOTIF-01 | Confirmation email sent after `payment_intent.succeeded`        | unit (mock Resend)          | `pnpm nx test api --testPathPattern=guest-email`       | ❌ Wave 0    |

### Webhook Signature Testing Pattern

Use `stripe.webhooks.generateTestHeaderString` for signature tests without a live Stripe connection:

```typescript
// In test setup (CITED: Stripe Node SDK)
import Stripe from 'stripe';
const stripe = new Stripe('sk_test_xxx');
const payload = JSON.stringify({ id: 'evt_test', type: 'payment_intent.succeeded', ... });
const sig = stripe.webhooks.generateTestHeaderString({
  payload,
  secret: 'whsec_test_secret',
});
// Now call the webhook handler with rawBody=Buffer.from(payload), sig header=sig
```

This pattern tests real signature verification, not mocks that skip it.

### Wave 0 Gaps

- [ ] `apps/api/src/contexts/ordering/infrastructure/stripe-payment.adapter.spec.ts`
- [ ] `apps/api/src/interfaces/http/webhook/stripe-webhook.controller.spec.ts`
- [ ] `apps/api/src/contexts/ordering/application/refund-order.service.spec.ts`
- [ ] `apps/api/src/infrastructure/outbox-dispatcher.service.spec.ts` — extend with gauge test
- [ ] `apps/api/src/contexts/notifications/infrastructure/guest-email.adapter.spec.ts`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category         | Applies                                            | Standard Control                                                                     |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| V2 Authentication     | no (guest checkout is anonymous)                   | —                                                                                    |
| V3 Session Management | partial (operator refund is authenticated)         | Existing `AuthGuard` + `PermissionsGuard`                                            |
| V4 Access Control     | yes — refund is owner-only (D-04), KYC gate (D-12) | `PermissionsGuard` + server-side `charges_enabled` check                             |
| V5 Input Validation   | yes                                                | `nestjs-zod` DTOs; `amount` must be positive integer ≤ captured                      |
| V6 Cryptography       | yes — webhook signature, Stripe secret key         | `stripe.webhooks.constructEvent` (HMAC-SHA256); keys via env schema + prod-guardrail |

### Known Threat Patterns

| Pattern                               | STRIDE                 | Standard Mitigation                                                                      |
| ------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| Webhook replay attack                 | Spoofing               | 5-minute tolerance window in `constructEvent`; `runDeduped` on event id                  |
| Forged webhook (no valid sig)         | Spoofing               | `constructEvent` throws `StripeSignatureVerificationError`; return 400                   |
| Double-charge via PI retry            | Elevation of Privilege | Cancel prior PI before creating new; deterministic idempotency keys                      |
| Operator refunds other tenant's order | Spoofing               | `ScopedTx` RLS + `eq(table.tenantId, ctx.tenantId)` on all payment queries               |
| `application_fee` hardcoded = 0       | Repudiation            | Config-driven; env schema entry `STRIPE_APP_FEE_BPS: z.coerce.number().default(0)`       |
| Stripe secret key exposure            | Information Disclosure | `prod-guardrails` boot-time check; never log; `packages/db` redact config covers `token` |
| `charges_enabled` UI-only gate        | Elevation of Privilege | Server-side check in `create-payment.service.ts` (D-12)                                  |
| Webhook route hit by rate limiter     | Denial of Service      | Exempt `/webhook/stripe` from per-IP rate limit; add to `security.ts` allowlist          |

### New Env Vars to Add to `env.schema.ts`

```typescript
// Following existing patterns (optional in dev, prod-guardrail required in prod):
STRIPE_SECRET_KEY: z.string().min(1).optional(),
STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
// D-03: fee as config (default 0 = no fee)
STRIPE_APP_FEE_BPS: z.coerce.number().int().min(0).max(10000).default(0),
```

Add to `superRefine` non-dev required check: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
Add to `assertProdGuardrails`: reject if `STRIPE_SECRET_KEY` starts with `sk_test_` in production.

---

## Open Questions

1. **Launch market + fiscalization deferral scope (investor BLOCK)**
   - What we know: fiscalization deferred per PROJECT.md.
   - What's unclear: which market(s) RestOS launches in first, and whether standalone web-order fiscal compliance is legally required in that market before first customer.
   - Recommendation: Document in CONTEXT.md before executing Phase 8. Example acceptable answer: "Launch in RU for first customer — no EU fiscal mandate applies." This is a business decision, not a code decision.

2. **Stripe platform agreement + EU platform registration**
   - What we know: RestOS needs to complete Stripe's platform profile and accept Connect platform agreement (CTO LOW finding #13). Even at application_fee=0, Stripe may charge per-active-connected-account fees.
   - Recommendation: Treat as a Definition of Done item for PAY-01, not a code task.

3. **`orders.currency` vs `tenant.defaultCurrency` mismatch guard**
   - What we know: `createOrder` takes currency from menu snapshot; `tenant.defaultCurrency` is set independently.
   - What's unclear: should the checkout service assert `order.currency === tenant.defaultCurrency` before creating the PI, or let Stripe reject mismatches?
   - Recommendation: Add explicit assertion in `create-payment.service.ts` — fail loudly with a 422 rather than a cryptic Stripe error.

4. **SITE-08 status poll endpoint scope**
   - What we know: `ORDINT-10` (`GET /v1/orders/:id/status`) is officially Phase 10. SITE-08 needs it to avoid showing "pending" on paid orders.
   - What's unclear: should Phase 8 stub this endpoint (thin read, no SSE) or borrow it early?
   - Recommendation: Phase 8 builds a thin `GET /v1/orders/:id/status` returning `{ status, orderNumber }` (no SSE). Phase 10 extends it with SSE. This avoids the circular gap (SITE-08 depends on Phase 10, Phase 10 depends on Phase 8).

5. **GNOTIF email "from" address per brand**
   - What we know: `RESEND_FROM` is a single global value. Brand-themed emails should ideally say "Пицца Розмарин <noreply@pizzarosmarin.com>".
   - What's unclear: Resend requires verified sending domains. A single `noreply@resto.app` is safe for MVP-1.
   - Recommendation: Use `RESEND_FROM` as-is for Phase 8; brand name interpolated in subject line (e.g., "Ваш заказ в Пицца Розмарин подтверждён"). Custom "from" domain is MVP-2.

---

## Assumptions Log

| #   | Claim                                                                                                          | Section                 | Risk if Wrong                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| A1  | `stripe@22.3.0` is compatible with Node.js ≥ 22.22.1 and the project's TypeScript 6.0.3                        | Standard Stack          | SDK may require types adjustment; unlikely for major official SDK                                      |
| A2  | Fastify `addContentTypeParser` with `parseAs: 'buffer'` on a per-route basis is possible before NestJS routing | Pattern 3 (webhook)     | May need alternative approach (Fastify plugin or `preValidation` hook)                                 |
| A3  | Plain-text email templates (no HTML) are acceptable for GNOTIF MVP                                             | GNOTIF pattern          | User expectation may require HTML; easy to extend                                                      |
| A4  | `stripe.webhooks.generateTestHeaderString` is available in `stripe@22.3.0` for test utilities                  | Validation Architecture | Verify in SDK; fallback: mock `webhooks.constructEvent` directly                                       |
| A5  | `brands.stripeAccountId` stays null for MVP; tenant is sole Connect account holder                             | Schema redesign         | If a multi-brand tenant has different Stripe accounts today (unlikely at MVP), checkout routing breaks |
| A6  | Stripe Express accounts support `card_payments` + `transfers` capabilities in all target markets               | Connect onboarding      | Some markets require different account types or capabilities                                           |

**If table is empty except for A1-A6:** All other claims in this research were verified via Stripe official docs or direct codebase inspection.

---

## Project Constraints (from CLAUDE.md)

- **TypeScript strict mode** throughout; `no-non-null-assertion`, `no-floating-promises` enforced
- **Migrations via `pnpm db:generate` → `pnpm db:migrate`** — never `drizzle-kit push`
- **RLS + ScopedTx double-enforcement** on all new payment/refund tables
- **Composite FK on every tenant-scoped child table** (ADR-0020 I-2) — `payment_refunds` must have `FOREIGN KEY (payment_id, tenant_id) REFERENCES payments(id, tenant_id)`
- **No hard deletes** — status-as-soft-delete; `refunded` / `disputed` are terminal statuses
- **`runInTenantContext` is HTTP-middleware-only** — webhook handler must use `db.withTenantId(tenantId, ...)` or `db.withoutTenant(reason, ...)`
- **`buildEnvelope` for all outbox events** — no direct `EventEnvelope` literal construction with `randomUUID()` as `correlationId`
- **`no-console`** — use `new Logger(ClassName.name)` throughout
- **Adapters implement ports via Symbol token** — `STRIPE_PAYMENT_PORT = Symbol('STRIPE_PAYMENT_PORT')`
- **Single quotes, trailing commas, semicolons, 100-char print width** (Prettier)
- **Kebab-case filenames** — `stripe-payment.adapter.ts`, `stripe-webhook.controller.ts`
- **No comments except WHY-comments** — strip stale ADR citations in `stripe-connect.adapter.ts` on touch
- **`STRIPE_SECRET_KEY` is server-only** — never in client component, never in `NEXT_PUBLIC_*` / `VITE_*` vars
- **`assertProdGuardrails`** — add Stripe keys to the prod-rejection check (no `sk_test_` in production)

---

## Sources

### Primary (HIGH confidence — CITED)

- Stripe Connect charges comparison (direct vs destination vs separate): `docs.stripe.com/connect/charges` — verified fee-payer and dispute liability semantics
- Stripe Express account creation + account_links: `docs.stripe.com/connect/express-accounts` — verified API parameters and onboarding flow
- Stripe account capabilities (charges_enabled, payouts_enabled, requirements): `docs.stripe.com/connect/account-capabilities` — verified KYC state fields
- Stripe PaymentIntent status machine (requires_action, SCA): `docs.stripe.com/payments/payment-intents/verifying-status` — verified all statuses + 3DS handling
- Stripe refunds API (partial, accumulation, webhook events): `docs.stripe.com/api/refunds/create` — verified full + partial refund parameters
- Stripe webhook signature verification (constructEvent, tolerance, 400): `docs.stripe.com/webhooks` — verified 5-minute tolerance, raw body requirement, 400 on bad sig
- Stripe idempotency keys: `docs.stripe.com/api/idempotent_requests` — verified 255-char limit, V4 UUID recommendation, 24-hour lifetime

### Primary (VERIFIED — direct codebase inspection)

- `packages/db/src/schema/ordering.ts` — current `payments` table structure; gap analysis based on actual column set
- `apps/api/src/contexts/ordering/domain/order.aggregate.ts` — `markPaid()` create-only guard, `refund()` full-only; confirmed delta needed
- `apps/api/src/contexts/identity/infrastructure/email/resend.adapter.ts` — retry/timeout/idempotency pattern to clone
- `apps/api/src/infrastructure/outbox-dispatcher.service.ts` — PAY-12 status: isLeader, lastDispatchAt, getOutboxLeaderHealth, no gauge
- `apps/api/src/health/health.controller.ts` — checkOutboxLeader false-negative: `staleMs !== null` condition
- `apps/api/src/shared/security.ts` — Fastify plugin registration order; raw-body issue identified
- `apps/api/src/config/env.schema.ts` — `OUTBOX_STALL_THRESHOLD_MS` default 60_000 vs PAY-12 "30s"
- `packages/db/src/schema/tenants.ts`, `brands.ts` — confirmed both have `stripeAccountId`; per-tenant vs per-brand issue
- `packages/events/src/inbox/run-deduped.ts` — confirmed external side effect caveat at line 27-31
- `apps/website/components/checkout/checkout-form.tsx` — confirmed hard-disabled "Place order" button
- `stripe@22.3.0` on npm: `github.com/stripe/stripe-node`, maintainer `stripe-bindings`, no postinstall, published 2026-06-24

### Secondary (MEDIUM confidence)

- Stripe destination charge docs (WebFetch): confirmed platform = fee-payer + dispute insurer — supports D-02 decision
- CTO/Skeptic/Investor persona reviews: flagged specific risks verified against codebase

---

## Metadata

**Confidence breakdown:**

- Standard Stack: HIGH — Stripe SDK verified on npm registry with official maintainer and GitHub repo
- Architecture (direct charge semantics): HIGH — verified via Stripe docs + persona review cross-check
- Schema redesign delta: HIGH — gap analysis from direct schema file reads
- Webhook raw-body solution: HIGH — pattern derived from existing `security.ts` + Stripe doc requirement
- SCA/3DS flow: HIGH — Stripe PaymentIntent status machine verified from official docs
- PAY-12 delta: HIGH — direct code read of all 3 remaining items
- GNOTIF template approach: MEDIUM — extends existing pattern; HTML templates deferred

**Research date:** 2026-06-27
**Valid until:** 2026-08-27 (Stripe API is stable; SDK may update — pin `stripe@22.3.0` exactly)
