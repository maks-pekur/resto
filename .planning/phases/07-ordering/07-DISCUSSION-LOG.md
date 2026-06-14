# Phase 7: Ordering - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-14
**Phase:** 7-Ordering
**Areas discussed:** Order lifecycle, Order identity, Money model, Discount engine

---

## Order lifecycle / state machine

| Option                                        | Description                                                                                                                       | Selected |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Full domain machine, only `created` reachable | Build all states/transitions/guards/events once; wire only cart→order in `created`; `paid`→Phase 8, accepted→…→completed→Phase 10 | ✓        |
| Minimal: `created` + `canceled`               | Model only `created`/`canceled` now; add states when their phase needs them                                                       |          |
| + wire `created→paid` now (stub payment)      | Manual/test paid transition now, no real Stripe                                                                                   |          |

**User's choice:** Full domain machine, only `created` reachable.
**Notes:** Order is created unpaid. Avoids a throwaway stub-paid transition; builds the machine once.

---

## Anonymous order identity / creation payload

| Option                        | Description                                                                                                                                            | Selected |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Mode + contact + order_number | `fulfillment_mode` (dine_in/pickup/delivery) + `table` (dine-in) + `customer_name/phone` (pickup/delivery) + readable `order_number`; address deferred | ✓        |
| Mode + table only             | dine-in focus now; name/phone deferred to Phase 8                                                                                                      |          |
| + delivery address now        | also capture address now                                                                                                                               |          |

**User's choice:** Mode + contact + order_number.
**Notes:** Address/delivery details deferred to Phase 8/9 (zone validation lives there); no unvalidated free-text address now.

---

## Money model / totals

| Option                                        | Description                                                                                             | Selected |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------- |
| Integer cents, round per-line→sum; fees=0 now | Minor units, round each line then sum; `delivery_fee`/`service_fee` columns default 0, formula in place | ✓        |
| Round at total only                           | Exact lines, round only the total                                                                       |          |
| Omit fee fields until their phase             | No fee columns now; extend formula later by migration                                                   |          |

**User's choice:** Integer cents, round per-line→sum; fees=0 now.
**Notes:** No floats; currency from brand/tenant. Keeps the totals formula stable (no later totals migration).

---

## Discount engine (PROMO-06)

| Option                               | Description                                                                                  | Selected |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | -------- |
| Full set per SPEC 3.1                | Pure fn: percent + fixed × cart/category/item; extensible `discount-spec` input; no codes/DB | ✓        |
| Percent+fixed, cart-level only       | cart-level only now; item/category later                                                     |          |
| Plain precomputed-amount passthrough | engine just subtracts a given amount; types in Phase 11                                      |          |

**User's choice:** Full set per SPEC 3.1.
**Notes:** SPEC §3.1 also has gift-item / gift-ladder / doubling promos — those are Phase 11 (promo campaigns). The `discount-spec` type is built extensible so Phase 11 adds them without rewriting the engine.

---

## Claude's Discretion

- DB column types/indexes; idempotency-key format/TTL/scope; `order_number` scheme; immutable-snapshot field set; event payload schemas; `scheduled_for` operating-hours validation (ORD-12); state-machine code structure.

## Deferred Ideas

- Advanced promo mechanics (gift-item, gift ladder, doubling) + promo codes → Phase 11.
- Real payment (Stripe, `paid` transition, `payments` rows) → Phase 8.
- Operator order intake (accepted→…→completed, incoming feed) → Phase 10.
- Delivery address capture + zone validation → Phase 8 / Phase 9.
- Reviewed-not-folded todo: `restructure-roadmap-ai-driven.md` (roadmap-meta, not ordering scope).
