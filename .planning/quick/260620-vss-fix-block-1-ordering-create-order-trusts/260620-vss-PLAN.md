---
quick_id: 260620-vss
title: 'Fix BLOCK-1 — server is the source of order prices'
status: in-progress
created: 2026-06-20
source_finding: .planning/notes/api-review-2026-06-15.md (BLOCK-1)
---

# Quick Task 260620-vss — Server-authoritative order pricing (BLOCK-1)

## Problem (confirmed by code read)

`POST /v1/orders` is `@Public()` and anonymous. `CreateOrderService` injects only
`ORDER_REPOSITORY`; it builds order lines straight from the request body
(`item.unitPrice`, `m.priceDelta`, `item.currency`) and passes the client
`discountSpec` through untouched. `Order.create → computeTotals` then trusts those
strings. `discount.ts` has no upper bound on `pct`, so `{percentage, cart, pct:100}`
yields `total = 0`. Net: any guest can order anything for `0.01` or free — a direct
blocker to safely accepting money in Phase 8.

## Fix — make the server the single source of prices

The domain money math (`computeTotals`) already derives everything from the
per-line `unitPrice`/`priceDelta` **strings**. So the fix is entirely at the
application (service) + contract (DTO) layers: feed the aggregate server-resolved
values, never client values; reject anything not orderable; drop client discounts.

### Tasks

**T1 — Ordering-owned pricing port + adapter (reuse catalog read path)**

- `ordering/domain/ports.ts`: add `MENU_PRICING_PORT` Symbol + `MenuPricingPort`
  interface with `loadSnapshot(tenantId, brandId): Promise<OrderingMenuSnapshot>`.
  Define ordering-owned plain types `OrderingMenuSnapshot` /
  `PricedMenuItem` / `PricedModifierOption` (decimal strings; no catalog type
  leakage into the application layer).
- `ordering/infrastructure/catalog-menu-pricing.adapter.ts`: implement the port by
  delegating to catalog `CatalogRepository.loadPublishedMenu(tenantId, version,
brandId)` (items + modifier groups w/ options) + `listStoppedItemIds(brandId)` +
  `MenuVersionPort.current(tenantId)`. Flatten into the snapshot:
  items → `{itemId, categoryId, basePrice, currency, sizes:[{sizeId,price}],
modifierGroupIds}`, options → `{optionId, groupId, priceDelta, freeAmount,
minAmount, maxAmount}`, plus `currency` (menu currency) and `stoppedItemIds`.
  Cross-context wiring lives in infra only — application layer stays clean.
- `catalog/catalog.module.ts`: add `exports: [CATALOG_REPOSITORY, MENU_VERSION_PORT]`
  so the ordering adapter can inject them.
- `ordering/ordering.module.ts`: `imports: [CatalogModule]`; provide
  `{ provide: MENU_PRICING_PORT, useClass: CatalogMenuPricingAdapter }`.

**T2 — Service rewrite + DTO contract tightening + error mapping**

- `ordering/application/create-order.service.ts`: inject `MENU_PRICING_PORT`.
  `brandId = requireBrandContext()`. Load snapshot; index items by id, options by id,
  stopped ids as a Set. For each line:
  - item missing from snapshot (covers unpublished / archived / cross-brand) →
    `OrderItemNotOrderableError` (422).
  - item id in stopped set → existing `OrderItemUnavailableError` (422).
  - unitPrice = size price when `sizeId` present & found, else item `basePrice`;
    `sizeId` present but not found → `OrderItemNotOrderableError`.
  - per modifier: option missing, or its `groupId` not in the item's
    `modifierGroupIds` → `OrderModifierNotAvailableError` (422); `maxAmount != null
&& amount > maxAmount` → `OrderModifierNotAvailableError`; effective priceDelta =
    `"0.00"` when `amount <= freeAmount`, else server `priceDelta`.
  - currency = snapshot menu currency (ignore any client currency).
    Pass `discountSpec: null` into `Order.create`. `name` kept only as display snapshot.
- `ordering/application/dto.ts`: remove client-authoritative fields from the request
  schema — `unitPrice`, `currency`, `priceDelta`, modifier `modifierGroupId`, and the
  top-level `discountSpec`. Keep `itemId`, `sizeId`, `name`, `quantity`,
  `modifiers:[{optionId, name, amount}]`. (No consumer sends these yet — checkout
  wires in at Phase 8 — so the contract tightening breaks no build.)
- `ordering/domain/errors.ts`: add `OrderItemNotOrderableError(itemId)` and
  `OrderModifierNotAvailableError(optionId)`; extend `OrderDomainError` union.
- `ordering/interfaces/http/error-mapping.ts`: map both new errors →
  `UnprocessableEntityException` with stable codes `ordering.item_not_orderable`
  and `ordering.modifier_not_available`.

**T3 — Tests + regen**

- `ordering/application/create-order.service.spec.ts` (unit, no Docker; fake
  `MenuPricingPort` + fake `OrderRepository`):
  - guest sends bogus `unitPrice` + a (now-removed) 100% discount → persisted
    `order.total` equals the real catalog total; discount ignored.
  - unknown / stop-listed / cross-brand item → throws (maps 422); nothing saved.
  - modifier option not on the item → throws (422).
  - happy path: a size-priced line + a paid modifier + a free-tier modifier →
    correct server total.
- Regenerate `docs/api/openapi.yaml` (`pnpm openapi:emit` in apps/api) and
  `packages/api-client/src/generated/api.ts` (api-client `gen`); commit both.

## Gates

- `npx nx typecheck api` green.
- Ordering vitest specs green.
- `pnpm openapi:check` clean (no uncommitted drift).

## Out of scope / deferred (surfaced, not silently dropped)

- Server-side promo resolution (there is no promo table until Phase 11) — discounts
  are simply disabled on the public path here, not resolved.
- Modifier-group min-selectable / required-group enforcement (selection-count rule,
  not a pricing rule) — separate from this money-safety fix.
- `loadPublishedMenu` presigns photos on the order path (minor S3 overhead); a
  leaner price-only query is a possible later optimization.
- Other API-review findings (BLOCK-2 GDPR erasure, payments unique, guardrail
  fail-open, etc.) are separate tasks.
