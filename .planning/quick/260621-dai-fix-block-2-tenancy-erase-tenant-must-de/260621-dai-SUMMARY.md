---
quick_id: 260621-dai
title: 'Fix BLOCK-2 — erase ordering tables in tenancy_erase_tenant'
status: complete
date: 2026-06-21
source_finding: .planning/notes/api-review-2026-06-15.md (BLOCK-2)
---

# Summary — GDPR erasure now covers orders/payments (BLOCK-2)

## What was wrong (confirmed by code read)

`tenancy_erase_tenant` (last revised in migration 0041, before the ordering tables
landed in 0049) never touched `orders` / `order_items` / `order_modifiers` /
`payments`. Two problems:

1. **GDPR:** guest PII (`customer_name`, `customer_phone`, `table_identifier`) and the
   Stripe `provider_payment_id` survived "right to be forgotten" forever.
2. **Latent FK bug:** `orders.brand_id` is `ON DELETE RESTRICT` to `brands`, and the
   function does `DELETE FROM brands` — so erasing any tenant **with orders** would
   have failed at that statement. No test covered it (silent gap).

## Fix

- Migration `0051_tenancy_erase_ordering_tables.sql`: `CREATE OR REPLACE` of the
  function (identical body to 0041) with four deletes added **before** the brands
  block, child-first: `order_modifiers` → `order_items` → `payments` → `orders`.
  (`order_items`/`order_modifiers`/`payments` cascade from `orders`; the explicit
  deletes match the function's documented "exhaustive audit surface" style.)
- Registered idx 51 in `migrations/meta/_journal.json` (hand-written policy
  migration, like 0011/0019/0026/0041).

## Verification

- `nx typecheck db` green.
- New integration test `packages/db/test/integration/erase-includes-ordering.spec.ts`
  (seeds tenant+brand+order+item+modifier+payment, runs erasure, asserts all wiped +
  brand removed) — passes against a fresh testcontainer (all migrations + 0051).
- Existing erase tests (`erase-includes-brands`, `tenancy-erase-guard`) still pass —
  no regression from replacing the function.
- Live end-to-end on the dev DB: seeded an order with PII + a payment, ran
  `tenancy_erase_tenant` → succeeded (old function would throw at `DELETE brands`),
  orders/items/modifiers/payments/brands all 0.

## Out of scope

- The review's optional schema-introspection meta-test (enumerate every tenant-scoped
  table, fail if not covered by erasure) — deferred; the focused integration test +
  the function's explicit-delete audit list cover the regression for now.
- HIGH-1 (`order_items.menu_item_id` FK) and HIGH-9 (`payments.provider_payment_id`
  unique) — separate findings.
