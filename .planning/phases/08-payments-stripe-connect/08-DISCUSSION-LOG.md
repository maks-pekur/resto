# Phase 8: Payments (Stripe Connect) — Discussion Log

**Date:** 2026-06-27
**Mode:** discuss (founder-selected areas + persona reviews)
_Human-reference record only — not consumed by downstream agents (CONTEXT.md is canonical)._

## Areas selected by founder

All four presented gray areas: Commission, Refunds, Currency, Guest UX.

## Decisions

| # | Area | Options presented | Founder choice |
|---|------|-------------------|----------------|
| 1 | RestOS commission per order | 0% (restaurant pays Stripe fees) · small fixed · RestOS covers Stripe fees | **0% — restaurant pays Stripe fees** (recommended) |
| 2 | Refunds | owner-only + reason + auto-on-cancel · payments:refund perm + reason · payments:refund perm, reason optional | **owner-only, reason mandatory, auto on cancel/reject** (recommended) |
| 3 | Currency | one per tenant · multi-currency | **one currency per tenant** (recommended) |
| 4 | Guest UX | full page + retry-on-same-order · minimal + new order on fail | **full confirmation page + retry on same order** (recommended) |

## Persona reviews (CTO / skeptic / investor)

Spawned per the RestOS discuss-phase policy for a money/fundability phase. Key cross-cutting findings folded into CONTEXT.md `<decisions>`:

- **BLOCK (all 3):** charge model — `application_fee=0` + the founder's "restaurant bears fees" requires **direct charges** (restaurant = merchant-of-record + dispute liability), NOT the roadmap's "destination charge". → CONTEXT D-02.
- **BLOCK:** payments/`Order` schema can't represent the money path (partial refunds, PI+Refund ids, SCA state). → D-07.
- **HIGH:** SCA/3DS state for EU cards (`created → requires_action → paid`). → D-08.
- **HIGH:** Stripe idempotency keys on PI/Refund create; webhook raw-body + signature; external side-effects not covered by inbox-dedup. → D-09/D-10.
- **BLOCK:** disputes/chargebacks unhandled. → D-11.
- **BLOCK (skeptic):** double-charge on retry-same-order. → D-06 guard.
- **HIGH (investor):** fee=0 forgoes the top payments lever (Toast: payments ARR ≈ subscription ARR) → make fee a config default-0. → D-03.
- **Scope correction:** PAY-12 leader-health ~80% already built (07.5-03) → only OTel gauge + false-negative fix. → D-14.
- **Sequencing:** GNOTIF-02 (accepted/ready emails) depends on Phase 10 operator transitions. → D-13.
- **Reconcile:** `stripeAccountId`/`defaultCurrency` on `brands` vs "per-tenant" currency. → D-05.

Full reviews: `08-PERSONA-CTO.md`, `08-PERSONA-SKEPTIC.md`, `08-PERSONA-INVESTOR.md`.

## Deferred ideas

SaaS subscription billing; multi-currency; `payments:refund`/manager break-glass; per-market fiscalization (bounded/dated); disputes beyond record+notify; Telegram/other channels.

## Open flag for founder

D-02 (direct vs destination charges) reverses PAY-06's "destination" wording — recorded as direct charges to honor decision #1; confirm before build.
