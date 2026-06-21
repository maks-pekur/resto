---
quick_id: 260621-e0m
title: 'Ordering HIGHs — order response contract (HIGH-12) + payments unique (HIGH-9)'
status: complete
date: 2026-06-21
source_finding: .planning/notes/api-review-2026-06-15.md (HIGH-9, HIGH-12)
commits:
  - 7550e9a fix(ordering): return full order response (status/total/currency) to match OpenAPI (HIGH-12)
  - b3371c5 fix(db): unique index on payments.provider_payment_id to dedupe webhook retries (HIGH-9)
---

# Summary — two clean ordering/payments HIGHs

## HIGH-12 — order response now matches the declared contract

`OrderResponseDto` (and thus OpenAPI) declares `{orderId, orderNumber, status, total,
currency}`, but `CreateOrderService.execute` returned only `{orderId, orderNumber}` —
the response contract lied, and clients never received the server-computed total.
Fixed by returning the full shape from the order snapshot (`status`, `total`,
`currency`). No OpenAPI change (the contract already declared 5 fields) — the
implementation now honours it. `openapi:check` stays in sync.

## HIGH-9 — payments.provider_payment_id is now unique

Stripe webhook retries could double-insert the same payment (no constraint). Added a
partial unique index `payments_provider_payment_id_uq` on `(provider,
provider_payment_id) WHERE provider_payment_id IS NOT NULL` — declared in the schema +
hand-written migration `0052` (drizzle-kit `generate` needs a TTY and the repo already
carries hand-written index/policy migrations).

## Verification

- `nx typecheck api db` green; `pnpm openapi:check` in sync; ordering suite 65/65.
- Live dev DB: migration 0052 applied; a second insert of the same `(stripe,
pi_dup_123)` was rejected — `duplicate key value violates unique constraint
payments_provider_payment_id_uq`.

## Deferred / flagged (not done here)

- **HIGH-1** (`order_items.menu_item_id` / `order_modifiers.option_id` FK) — debatable:
  the `name_snapshot`/`unit_price` snapshot is intentional so an order is decoupled from
  the menu lifecycle (archive/rename/reprice). A hard FK re-couples them. Needs a design
  call, not a blind add.
- **HIGH-4** (modifier `amount` not multiplied; free-unit × quantity model) and
  **HIGH-13** (invalid UUID path param → 500 in catalog controllers) — next batch.
- HIGH-9 protects an empty table until Phase 8 writes payments; included now since the
  constraint is cheap and prevents the bug from ever existing.
