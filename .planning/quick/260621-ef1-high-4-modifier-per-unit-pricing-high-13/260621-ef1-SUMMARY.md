---
quick_id: 260621-ef1
title: 'HIGH-4 modifier per-unit pricing + HIGH-13 catalog UUID validation; HIGH-1 by-design'
status: complete
date: 2026-06-21
source_finding: .planning/notes/api-review-2026-06-15.md (HIGH-1, HIGH-4, HIGH-13)
commits:
  - b643c51 fix(ordering): charge modifiers per unit with free-allowance proration (HIGH-4)
  - d95d303 fix(catalog): validate UUID path params with ParseUUIDPipe — 400 not 500 (HIGH-13)
---

# Summary — two HIGHs fixed + HIGH-1 design decision

## HIGH-4 — modifier `amount` is now charged per unit

`computeTotals` summed each modifier's `priceDelta` exactly once, ignoring `amount`
(parsed, carried, persisted) — a "3× paid cheese" order was charged 1× while the
kitchen saw amount=3. Fixed by charging `priceDelta × max(0, amount − freeAmount)`:
the domain now prorates the free allowance instead of the BLOCK-1 all-or-nothing
zeroing, so the persisted modifier keeps the **real** per-unit price + selected amount
(correct receipt) and the math is right. `freeAmount` added as an optional domain
input field (not persisted — the line total already captures it).

## HIGH-13 — invalid UUID path params → 400, not raw 500

Bad UUIDs hit Postgres as `22P02` → raw 500. Added `ParseUUIDPipe` to the
admin/internal UUID params: catalog `DELETE stop-list/:itemId`, `PATCH
categories/:id/archive`, `PATCH items/:id/archive`, internal `GET items/:id`, `GET
modifier-groups/:id`. Public `GET /v1/menu/items/:id` was already safe (`safeParse` →
404), left untouched.

## HIGH-1 — DECISION: by design, no FK (per founder)

`order_items.menu_item_id` / `order_modifiers.option_id` have no FK to the catalog.
**Resolved as intentional:** the `name_snapshot` / `unit_price` snapshot exists
precisely so an order is an immutable historical record, decoupled from the menu
lifecycle (archive / rename / reprice / erase). A hard FK would re-couple them and
could block menu-item archival. Won't-fix. (The erasure path already deletes order
rows first — see BLOCK-2 — so there's no referential-integrity gap at teardown.)

## Verification

- `nx typecheck api` green; `pnpm openapi:check` in sync (ParseUUIDPipe didn't shift
  the contract); ordering suite 67/67 (incl. 2 new HIGH-4 tests: domain proration +
  service amount>1).
- Live: internal `GET .../items/not-a-uuid` → **400** (`validation failed (uuid is
expected)`); valid-but-missing uuid → clean **404**.

## Remaining from the review

- **HIGH-5** (modifier group min/max/required server-side validation) — not done.
- **BLOCK-3** = Phase 8 (Stripe Connect) — a full phase, plan via `/gsd:plan-phase`.
