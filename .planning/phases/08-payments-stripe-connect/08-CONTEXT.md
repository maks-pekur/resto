# Phase 8: Payments (Stripe Connect) — Context

**Gathered:** 2026-06-27
**Status:** Ready for planning
**Source:** /gsd:discuss-phase (founder decisions 2026-06-26 + persona reviews CTO / skeptic / investor)

<domain>
## Phase Boundary

Replace `NoopStripeConnectAdapter` with a real **Stripe Connect Express** money path so a
restaurant can take **paid** guest orders: Connect onboarding (account_link), checkout →
`PaymentIntent` routed to the tenant's Stripe account, webhook-driven order state
transitions (`paid` / `failed` / `refunded`), operator refunds (full + partial), the
KYC-pending UX gate, an order confirmation page (SITE-08), and brand-themed guest emails
(GNOTIF). This is the **revenue-enabling** phase — the gate to "first paying customer".

Covers the 18 requirements PAY-01..13, SITE-08, GNOTIF-01..04.

**The persona reviews (08-PERSONA-CTO/SKEPTIC/INVESTOR.md) re-scoped this phase:** it is
NOT just "wire the adapter". It is **(1) a charge-model decision, (2) a payments/order
schema + aggregate redesign, (3) the adapter, (4) the guest-notification surface**. The
backing infra (transactional outbox, inbox-dedup, Resend transport, outbox leader
election) already exists and is reused — no rewrite.

**Not in scope (deferred — see `<deferred>`):** SaaS subscription billing (separate later
adapter), multi-payment-provider, multi-currency, per-market fiscalization (bounded
deferral), Telegram/other payment channels. Operator order-transition UI is **Phase 10**
(GNOTIF-02 depends on it — see D-13).
</domain>

<decisions>
## Implementation Decisions

### Charge model & monetization

- **D-01:** (founder, LOCKED) RestOS takes **no per-order commission** — the Stripe
  `application_fee` is **0**. The restaurant bears Stripe's processing fees. Monetization is
  a **flat subscription per location** (PROJECT.md: "restaurants culturally reject % cuts").
- **D-02:** (resolution — RESOLVES the all-persona BLOCK) Use **direct charges** on the
  connected account, **not** destination charges. With `application_fee = 0` the founder's
  intent ("restaurant bears Stripe fees + is the merchant") is only correct under direct
  charges — there the **connected account is merchant-of-record** and bears Stripe fees +
  **dispute/chargeback liability**. Destination charges would silently make RestOS the
  fee-payer + dispute insurer on every order (≈1.5–3.3% + Connect platform fees) — the
  opposite of D-01. PAY-06's "destination" wording is superseded by this. *(Flagged to the
  founder; confirm before build. Trade-off: direct charges = less RestOS liability/control,
  restaurant owns disputes.)*
- **D-03:** (investor HIGH) The application fee MUST be a **config value (default 0)**, never
  a hardcoded `0`. Keeps the highest-margin lever (payments take-rate) open without a code
  change. Reconcile PAY-06's "RestOS application_fee_amount" wording with the 0 default.

### Refunds

- **D-04:** (founder, LOCKED) Refunds are **owner-only**, a **reason is mandatory** (audit),
  and **full + partial** are both supported. Order **cancel/reject of a paid order →
  automatic refund**. *(Persona note: owner-only is operationally brittle — no manager
  break-glass; a `payments:refund` permission is a candidate fast-follow, see `<deferred>`.)*

### Currency

- **D-05:** (founder, LOCKED) **One currency per tenant**, fixed at Stripe onboarding; all
  amounts in it. Multi-currency deferred. **Reconcile:** `stripeAccountId` + `defaultCurrency`
  currently live on `brands` (not `tenants`) — under multibrand, currency/Stripe-account is
  effectively **per-brand**. Planner must resolve "per-tenant" (founder wording) vs the
  per-brand schema; for a single-brand first customer they coincide.

### Guest checkout UX

- **D-06:** (founder, LOCKED) Confirmation page (SITE-08) shows **order #, items, total, ETA,
  live status**. On payment failure the guest **retries on the SAME order** (new
  PaymentIntent; order + cart preserved). **MUST guard against double-charge** (skeptic/CTO
  BLOCK): before creating a new PaymentIntent, check/cancel the prior one — a late-succeeding
  first PI must not double-charge.

### Money-path correctness (persona-mandated, planner MUST address)

- **D-07:** (CTO/skeptic/investor BLOCK) **Schema + `Order` aggregate redesign** is the first
  build slice. Today: `payments` has a single nullable `provider_payment_id` and no
  `refunded_amount`; `Order.refund()` is **full-only**. Need: partial-refund accounting
  (`refunds` rows or `refunded_amount`), room for both PaymentIntent id and Refund id(s),
  Stripe account linkage, and a payment-status model that survives webhook ordering.
- **D-08:** (investor HIGH — EU revenue bug, not just compliance) Add an **SCA/3DS**
  intermediate state — `created → requires_action → paid` — so EU cards that need Strong
  Customer Authentication don't silently fail. PaymentIntent `requires_action` must be
  representable.
- **D-09:** (CTO HIGH) **Stripe idempotency keys** on every PaymentIntent and Refund
  *creation* call — retries without keys are a double-spend generator. This is separate from
  webhook inbox-dedup.
- **D-10:** (CTO HIGH) Webhook handler: configure **Fastify raw-body** capture on the Stripe
  route (else signature verification silently breaks), verify signature (400 on invalid),
  and idempotency via `runDeduped` keyed on the **Stripe event id**. NOTE: `runDeduped`
  guards handler invocation, **not** external side effects — the refund call + emails need
  their own idempotency (D-09 keys + email dedup).
- **D-11:** (skeptic/investor BLOCK) Handle **disputes/chargebacks** at least minimally —
  catch `charge.dispute.created` → record + notify. Under D-02 (direct charges) liability is
  on the restaurant, but the event must not be a silent blind spot.
- **D-12:** (skeptic/CTO) A **server-side "can this tenant/brand accept money?" predicate**
  (KYC complete + Stripe capability active) enforced **at checkout**, not just the admin UI
  switch (PAY-13). UI gating alone is bypassable.

### Notifications (GNOTIF)

- **D-13:** (sequencing trap — CTO/skeptic) GNOTIF reuses the Resend **transport** but the
  guest-notification + brand-theming + per-locale surface is **net-new** (`EmailAdapterPort`
  only has the 3 auth methods today). **GNOTIF-01 (confirmation)** + **GNOTIF-03 (refund)**
  fire from Phase 8 events (`payment_intent.succeeded`, refund). **GNOTIF-02 (accepted /
  ready-or-on-its-way)** depends on operator order-transition triggers that ship in
  **Phase 10** — build the email machinery + templates in Phase 8, wired to an
  order-status-changed domain event, **activated when Phase 10 transitions land**.

### PAY-12 — outbox leader health (mostly already built)

- **D-14:** (CTO/skeptic — avoid over-planning) Leader election (pg advisory lock),
  heartbeat, and the `/readyz` stale-leader drain already exist (shipped in 07.5-03). The
  only real delta: add the **`outbox.is_leader` OTel gauge (1/0)**, fix a never-dispatched-
  leader **false-negative** in `getOutboxLeaderHealth()`/`checkOutboxLeader()`, and
  reconcile PAY-12's ">30s" with the current **60_000 ms** default in `env.schema.ts`.

### Claude's Discretion (planner/researcher decide)

- Exact Stripe SDK version + adapter shape (mirror the Resend adapter's retry/timeout/
  idempotency pattern); PaymentIntent confirmation flow (Payment Element vs hosted); account_
  link refresh/return URL handling; how the KYC capability predicate is cached; refund/dispute
  event → order-state mapping details; email template engine + per-locale structure.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before researching or planning.**

### Phase scope + reviews
- `.planning/ROADMAP.md` §"Phase 8: Payments (Stripe Connect)" — goal + 5 success criteria + the 18 requirement IDs.
- `.planning/REQUIREMENTS.md` — PAY-01..13, SITE-08, GNOTIF-01..04 (full text).
- `.planning/phases/08-payments-stripe-connect/08-PERSONA-CTO.md` — money-path correctness, charge-model BLOCK, schema/aggregate redesign, webhook raw-body + races, PAY-12 status.
- `.planning/phases/08-payments-stripe-connect/08-PERSONA-SKEPTIC.md` — double-charge-on-retry, disputes blind spot, fee=0≠free, scope mis-sizing, GNOTIF sequencing.
- `.planning/phases/08-payments-stripe-connect/08-PERSONA-INVESTOR.md` — unit economics of fee=0 (Toast 48bps; payments ARR ≈ subscription ARR), SCA/3DS, dispute liability, fiscalization deferral, fee-as-config.

### Project constraints
- `.planning/PROJECT.md` — monetization = subscription not commission; Stripe Connect for restaurant↔guest; PCI never touched; fiscalization deferred; persona-review policy.
- `./CLAUDE.md` + `apps/CLAUDE.md` + `packages/db/CLAUDE.md` — tenancy/RLS invariants, ScopedTx, outbox/inbox rules, no-hard-deletes (status-as-soft-delete).

### Money-path code (read before designing the redesign)
- `apps/api/src/contexts/tenancy/infrastructure/stripe-connect.adapter.ts` + `apps/api/src/contexts/tenancy/domain/ports.ts` (`StripeConnectPort`) — the Noop to replace.
- `apps/api/src/contexts/ordering/domain/order.aggregate.ts` — `markPaid` (create-only guard), `refund()` (full-only — must support partial), state machine.
- `packages/db/src/schema/ordering.ts` — `orders` status enum + `payments` table (needs redesign for D-07).
- `packages/db/src/schema/tenants.ts` + `packages/db/src/schema/brands.ts` — `stripeAccountId` (+ brand `defaultCurrency`) — the per-brand vs per-tenant reconciliation (D-05).
- `packages/events/src/inbox/run-deduped.ts` — webhook idempotency primitive (D-10; note it does NOT guard external side effects).
- `apps/api/src/infrastructure/outbox-dispatcher.service.ts` + `apps/api/src/health/health.controller.ts` — leader election + `/readyz` (PAY-12, D-14).
- `apps/api/src/contexts/identity/infrastructure/email/resend.adapter.ts` + `email-adapter.factory.ts` + identity `domain/ports.ts` (`EmailAdapterPort`) — transport to reuse; notification surface is net-new (D-13).
- `apps/website/components/checkout/checkout-form.tsx` — the disabled "Place order" stub to wire (SITE-08 + checkout).
- `apps/api/src/config/env.schema.ts` — leader stale-threshold default (60_000 ms vs PAY-12 >30s).

### External (Stripe — researcher MUST verify current)
- Stripe Connect **direct charges** + fee-payer/liability model (D-02).
- Stripe **SCA / 3DS for Connect platforms** (D-08).
- Stripe **disputes / risk management with Connect** (D-11).
- Stripe **idempotency keys** (D-09).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Transactional **outbox + inbox-dedup** (`@resto/events`) — webhook idempotency keyed on Stripe event id; the dispatcher + leader election are live.
- **Resend email transport** (`resend.adapter.ts` + factory + mailhog/captured dev/test adapters) — reuse for GNOTIF; the notification METHODS + brand templates are net-new.
- **PAY-12 ~80% built** — advisory-lock leader election + heartbeat + `/readyz` stale-leader drain already shipped (07.5-03).
- `payments`/`orders` schema + `stripeAccountId` columns exist — but `payments` + `Order.refund()` need redesign for partial refunds / PI+Refund ids / SCA state (D-07/D-08).

### Established Patterns
- Status-as-soft-delete (no hard deletes); RLS + ScopedTx double-enforcement on every tenant-scoped table; adapters implement domain ports wired by Symbol token.
- `runDeduped(db, envelope, consumer, fn)` for at-most-once handler invocation.

### Integration Points
- Stripe (Connect Express, webhooks) ↔ api; PaymentIntent/Refund ↔ `payments`/`orders`; webhook ↔ outbox/inbox; guest emails ↔ Resend; confirmation page ↔ `apps/website` + (Phase 10) public order-status endpoint.
</code_context>

<specifics>
## Specific Ideas (locked direction for the planner)

- **Direct charges, `application_fee` = config (default 0)** — restaurant is merchant-of-record, bears Stripe fees + disputes; RestOS takes 0 by default but the lever stays open (D-01/D-02/D-03).
- **Schema redesign is the FIRST plan/slice** before the adapter (D-07) — partial refunds + PI/Refund ids + `requires_action` SCA state.
- **One currency per tenant/brand**, set at onboarding (D-05).
- **Owner-only refund, reason mandatory, auto on cancel/reject** (D-04).
- **Retry-on-same-order with a double-charge guard** (D-06).
- **Stripe idempotency keys on every PI/Refund create** (D-09); webhook raw-body + signature + event-id dedup (D-10).
- **Disputes**: catch `charge.dispute.created` → record + notify (D-11).
- **GNOTIF-01/03 in Phase 8; GNOTIF-02 machinery in 8, fires from Phase 10 transitions** (D-13).
</specifics>

<deferred>
## Deferred Ideas

- **SaaS subscription billing** — separate later adapter (MVP-2); not coupled to Connect.
- **Multi-currency** per tenant/brand — single currency for MVP (D-05).
- **`payments:refund` permission / manager break-glass** — owner-only is the MVP rule (D-04); revisit if owner-availability bites operations.
- **Per-market fiscalization** — investor BLOCK reframed as a **bounded, dated, launch-market-scoped** deferral: taking real EU payments with fiscal compliance undefined is acceptable ONLY as a documented time-boxed call for the launch market; revisit before market expansion. (Decide the launch market + date during planning.)
- **Disputes beyond record+notify** (evidence submission UX, auto-refund-on-loss) — minimal handling only in Phase 8.
- **Telegram / other payment channels** — MVP-3.

None of the above block Phase 8 — all stayed within the payments boundary.
</deferred>

---

_Phase: 08-payments-stripe-connect_
_Context gathered: 2026-06-27 via /gsd:discuss-phase (founder + persona reviews)_
