# Phase 7: Ordering - Context

**Gathered:** 2026-06-14
**Status:** Ready for planning

<domain>
## Phase Boundary

The new `ordering` bounded context (`apps/api/src/contexts/ordering/`, 4-layer DDD) — backend only, no UI. It turns an anonymous cart into a persisted `Order`: a full state-machine `Order` aggregate, an immutable item/modifier/price snapshot at creation, domain-layer totals with a pure discount engine (PROMO-06), event contracts + audit wiring, the `ordering.>` NATS subject, and the supporting DB tables (`orders`, `order_items`, `order_modifiers`, `payments`).

**Hard sequencing context (drives the decisions below):** payment is Phase 8, operator order intake is Phase 10, delivery zones are Phase 9. So in Phase 7 an order is created **unpaid** and only the `created` entry is reachable; payment and operator transitions unlock in their phases. ORD-11 (outbox claim-token) is **already shipped** (AUDIT #11, see refs) — do not rebuild it.
</domain>

<decisions>
## Implementation Decisions

### Order lifecycle / state machine (ORD-02)

- **D-01:** Build the **full domain state machine in one pass** — all states (`created → paid → accepted → preparing → ready → completed`, plus `canceled`, `refunded`, `failed`), their transition guards, and the per-transition domain events — but wire only the **one reachable entry**: `cart → Order` lands in `created` (unpaid). `paid` is unlocked by Phase 8 (Stripe), `accepted → … → completed` by Phase 10 (admin intake). No stub `paid` transition now (rejected option C — avoids throwaway). Unreachable transitions are domain-tested but have no HTTP surface yet.

### Anonymous order identity / creation payload (ORD-03)

- **D-02:** The order captures at creation: `fulfillment_mode` ∈ {`dine_in`, `pickup`, `delivery`}; `table` (for `dine_in`, from the QR table binding); `customer_name` + `customer_phone` (for `pickup`/`delivery`); and a human-readable `order_number`. Delivery **address / delivery details are deferred** — captured + validated in Phase 8 (checkout) / Phase 9 (zone validation); do NOT capture a free-text address now (rejected option C — would be an unvalidated field that Phase 9 reworks).

### Money model / totals (ORD-05)

- **D-03:** Money is **integer minor units (cents)** throughout — no floats. Rounding is **per-line then summed** (round each `order_item`/modifier line, then sum to subtotal/total), not round-at-total. Currency comes from the brand/tenant (same source the catalog menu uses).
- **D-04:** `delivery_fee` and `service_fee` are real columns on `orders` **defaulting to 0** now (the `subtotal + modifiers + delivery + service_fee − discount = total` formula is implemented in full); they get populated in Phase 8/9. (Rejected "omit fields until their phase" — keeps the totals formula stable, no later totals migration.)

### Discount engine PROMO-06

- **D-05:** A **pure** domain function (no DB calls, no codes) that computes discounts of kind **percentage** and **fixed-amount** at **cart / category / item** level (the SPEC §3.1 "Скидки (% и фикс) на товар / категорию / корзину" set). It takes an explicit **`discount-spec` input** and returns the discount amount in minor units. The `discount-spec` type MUST be **extensible** (e.g. a discriminated union on discount kind + scope) so Phase 11 adds promo-campaign mechanics (gift-item, gift ladder, doubling) and promo codes WITHOUT rewriting the engine. Built complete once so Phase 8 checkout and Phase 11 codes just feed it.

### Already satisfied out-of-band (do not rebuild)

- **D-06:** ORD-11 (outbox claim-token to prevent multi-replica double-delivery) is **DONE** — AUDIT #11 added a per-claim `claim_id` UUID epoch to `outbox_events` and scoped `releaseOutboxClaim`/`markOutboxDelivered` by it (lost-update fence). The only residual is **cosmetic**: the requirement says column `claim_token`; the shipped column is `claim_id`. Planner: either accept `claim_id` as satisfying ORD-11, or do a trivial rename — do NOT re-implement the mechanism. Regression net: `packages/events/test/integration/outbox-claim-ownership.spec.ts`.

### Claude's Discretion

Left to research/planner (standard patterns, not founder-facing): exact DB column types + indexes; idempotency-key format/TTL/scope; `order_number` generation scheme; the precise immutable-snapshot shape (which fields are frozen); event payload schemas; `scheduled_for` operating-hours validation source (ORD-12); state-machine code structure.
</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements + roadmap

- `.planning/REQUIREMENTS.md` — ORD-01..12 + PROMO-06 (the locked requirement set for this phase; see also the traceability table).
- `.planning/ROADMAP.md` §"Phase 7: Ordering" — goal, success criteria, persona reviewers (CTO/skeptic/investor).

### Product spec (discounts + ordering surface)

- `SPEC.md` §3.1 ("Промо и скидки") — the discount model PROMO-06 implements: "% и фикс на товар / категорию / корзину" (the in-scope set). The advanced promo mechanics in the same section — "блюдо в подарок (триггер по сумме)", "лесенка подарков", "акция удвоение" — are **Phase 11**, not Phase 7 (see Deferred). Russian, source-of-truth for product surface.

### Platform invariants (apply to the new context + tables)

- `docs/adr/0020-multi-tenancy-and-event-bus-invariants.md` — composite FK on tenant-scoped child tables (ORD-06: `order_items`/`order_modifiers` carry `(order_id, tenant_id)` FKs); outbox `correlationId` from OTel span; `runInTenantContext` HTTP-only; inbox dedup via `runDeduped`.
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/STRUCTURE.md` — the hexagonal 4-layer DDD layout, naming/suffix conventions, and where context code lives (the new `ordering` context mirrors `catalog`/`tenancy`/`identity`).

### Already-shipped ORD-11 reference

- AUDIT #11 (merged PR #214) — `outbox_events.claim_id` + scoped release/mark. Code: `packages/events/src/outbox/repository.ts` (`claimOutboxBatch`/`releaseOutboxClaim`/`markOutboxDelivered`), `packages/db/src/schema/outbox.ts` (`claim_id` column). Guard: `packages/events/test/integration/outbox-claim-ownership.spec.ts`.
  </canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`@resto/cart` (`packages/cart`)** — the anonymous cart store built in Phases 5/6 (items, modifiers, table binding). It is the INPUT to cart→order conversion (ORD-03). The order creation API consumes a cart-shaped payload.
- **Outbox + events + audit pipeline (`packages/events`)** — `buildEnvelope`, `appendToOutbox` in the same tx as the state change, `defineEventContract` for `ordering.*` contracts; the `audit` context already subscribes to `tenancy.>`/`identity.>` via `NatsAuditSubscriber` + `runDeduped` (ORD-07/08/09 follow this exact pattern — add `ordering.>` to `STREAM_SUBJECTS` + an audit subscription).
- **`ScopedTx` / `compositeTenantFk` / `tenantIdColumn` (`packages/db`)** — the mandatory tenancy enforcement + composite-FK helper for the new `orders`/`order_items`/`order_modifiers`/`payments` tables (ORD-06).
- **Catalog read for snapshot source** — item/modifier/price data for the immutable snapshot (ORD-04) comes from the catalog (published menu), captured at creation time so later catalog edits don't mutate historical orders.

### Established Patterns

- **4-layer DDD context** (`domain/` → `application/` → `infrastructure/` → `interfaces/http/`) with Symbol-keyed ports, aggregate `fromSnapshot`/`pullEvents`, `*.service.ts` single `execute()`, `error-mapping.ts` per controller — `ordering` mirrors `catalog`/`tenancy`.
- **Hand-written migrations + `_journal.json`** (db:generate is unusable); next migration index continues from 0048 (latest on main). Backfill-before-NOT-NULL where needed.
- **Money** — the catalog already uses branded `MoneyAmount`/`Currency` value types (`@resto/domain`); reuse them for order totals (integer-minor-units decision D-03).

### Integration Points

- `ordering` reads the published catalog (for the snapshot) and the brand/tenant (currency); emits `ordering.*` events → outbox → NATS → `audit`. No payment integration yet (Phase 8 wires Stripe to the `paid` transition). The pure discount engine is consumed later by Phase 8 checkout + Phase 11 promo codes.
  </code_context>

<specifics>
## Specific Ideas

- **State set (D-01):** `created`, `paid`, `accepted`, `preparing`, `ready`, `completed`, `canceled`, `refunded`, `failed` — domain-complete; only `created` reachable in Phase 7.
- **Discount kinds × scopes (D-05):** {percentage, fixed} × {cart, category, item}; explicit extensible `discount-spec` input; pure (no DB).
- **Totals formula (D-03/04):** `subtotal + modifiers + delivery_fee + service_fee − discount = total`, integer cents, round-per-line, fees default 0.
  </specifics>

<deferred>
## Deferred Ideas

- **Advanced promo mechanics** (SPEC §3.1: gift-item by cart-sum trigger, gift ladder, doubling promo) + **promo codes** (single/bulk/auto-apply) → **Phase 11 (Promo & Discounts)**. The Phase 7 `discount-spec` type is built extensible to absorb these without an engine rewrite.
- **Real payment** (Stripe Connect, `paid` transition, `payments` rows populated) → **Phase 8**.
- **Operator order intake** (the `accepted → preparing → ready → completed` transitions, the incoming-orders feed) → **Phase 10**.
- **Delivery address capture + zone validation** → **Phase 8 (checkout) / Phase 9 (zones)**.

### Reviewed Todos (not folded)

- `restructure-roadmap-ai-driven.md` ("Restructure ROADMAP under AI-driven positioning") — matched at score 0.6 on generic keywords (phase/status), but it is roadmap-meta, not `ordering`-context work. Not folded into Phase 7.
  </deferred>

---

_Phase: 7-Ordering_
_Context gathered: 2026-06-14_
