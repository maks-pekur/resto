---
quick_id: 260620-vss
title: 'Fix BLOCK-1 — server is the source of order prices'
status: complete
date: 2026-06-20
source_finding: .planning/notes/api-review-2026-06-15.md (BLOCK-1)
commits:
  - 239cc58 fix(ordering): explicit @Inject on OrdersController so DI resolves under tsx/esbuild
  - 18ab957 fix(ordering): server-authoritative order pricing; ignore client prices and discounts (BLOCK-1)
---

# Summary — BLOCK-1 server-authoritative order pricing

## What was wrong (confirmed by code read)

`POST /v1/orders` (`@Public`, anonymous) built order lines straight from the
request body — `unitPrice`, `priceDelta`, `currency` — and passed the client
`discountSpec` through untouched. `discount.ts` had no upper bound on `pct`, so a
`{percentage, cart, pct:100}` zeroed the total. A guest could order anything for
`0.01` or free. Direct blocker to safely accepting money in Phase 8.

## Fix

The server is now the single source of prices. The domain math (`computeTotals`)
already derives everything from the per-line `unitPrice`/`priceDelta` strings, so
the fix lives at the application + contract layers:

- **New ordering port `MENU_PRICING_PORT`** (`ordering/domain/ports.ts`) returning an
  `OrderingMenuSnapshot` (priced items w/ sizes, modifier options w/
  priceDelta/freeAmount/min/max, stopped-item ids, menu currency).
- **`CatalogMenuPricingAdapter`** (`ordering/infrastructure/`) implements it by
  delegating to the existing catalog read path — `CatalogRepository.loadPublishedMenu`
  - `listStoppedItemIds` + `MenuVersionPort` — scoped by tenant+brand through
    ScopedTx+RLS. Cross-context wiring stays in infra; the application layer depends
    only on the port. Required exporting `CATALOG_REPOSITORY` + `MENU_VERSION_PORT`
    from `CatalogModule` and importing `CatalogModule` into `OrderingModule`.
- **`CreateOrderService`** now resolves every line from the snapshot: server unit
  price (size-aware), server modifier `priceDelta` (free within `freeAmount`,
  rejected above `maxAmount`), order currency = menu currency. `discountSpec` is
  forced to `null` (no promo source until Phase 11). Client `name` kept only as a
  display snapshot.
- **422 rejections** via new domain errors `OrderItemNotOrderableError`
  (`ordering.item_not_orderable`) and `OrderModifierNotAvailableError`
  (`ordering.modifier_not_available`); stop-listed reuses `OrderItemUnavailableError`.
- **Request contract tightened**: `unitPrice`, `currency`, `priceDelta`, modifier
  `modifierGroupId`, and `discountSpec` removed from the DTO (no consumer sends them —
  checkout wires in at Phase 8). OpenAPI + api-client regenerated.

## Discovered + fixed alongside (pre-existing, same endpoint)

`OrdersController` used bare class injection
(`constructor(private readonly createOrder: CreateOrderService)`). esbuild/tsx
emit no `design:paramtypes`, so Nest injected `undefined` → `POST /v1/orders`
500'd for everyone. The HTTP path had no e2e coverage (only a service-direct
integration test), so this shipped in Phase 7 unnoticed. Fixed with the project's
explicit-`@Inject` pattern. Confirmed pre-existing by stashing the BLOCK-1 work and
reproducing the 500 on the original code.

## Verification

- Typecheck (`nx typecheck api`) green; OpenAPI drift gate (`pnpm openapi:check`) in sync.
- 8 new unit tests (`apps/api/test/unit/create-order.service.spec.ts`) + updated
  Docker integration spec; full ordering suite 65/65 green.
- **Live end-to-end** against `cafe-demo`: a guest payload with `unitPrice:"0.01"` +
  100% `discountSpec` on item "Маргарита" (catalog 12.50) × 2 → persisted order
  `total = 25.00`, `discount = 0.00`, `unit_price = 12.50`. Bogus item → 422
  `ordering.item_not_orderable`.

## Dev-environment repair (not committed — DB state only)

This 2-day-old dev DB was missing `resto_app` grants on the menu-caching tables
(`catalog_menu_version`, `catalog_brand_stop_version`, `menu_stop_list`) from
migration 0048's roles step — it broke the existing `/v1/menu` read too. Re-applied
`packages/db/sql/roles.sql` (idempotent) to restore grants. No code change.

## Out of scope (surfaced, not silently dropped)

- Server-side promo resolution (no promo table until Phase 11) — discounts disabled
  on the public path, not resolved.
- Modifier-group min-selectable / required-group enforcement (selection rule, not pricing).
- `loadPublishedMenu` presigns photos on the order path (minor S3 overhead) — a leaner
  price-only query is a possible later optimization.
- Remaining API-review findings (BLOCK-2 GDPR erasure of orders/payments, payments
  `provider_payment_id` unique, guardrail fail-open, in-memory rate-limit) — separate tasks.
