---
phase: 07-ordering
plan: '04'
subsystem: ordering
tags:
  [application-layer, repository, idempotency, outbox, dto, integration-test]
dependency_graph:
  requires: [07-02, 07-03]
  provides:
    [
      create-order-service,
      get-order-service,
      order-drizzle-repository,
      ordering-dto,
    ]
  affects: [ordering-module-wiring-07-05]
tech_stack:
  added: []
  patterns:
    - onConflictDoNothing composite target for HTTP-level idempotency
    - loadByIdWithTx private helper to avoid nested withTenant calls
    - domainEventToEnvelope exhaustive switch for all 5 ordering event kinds
key_files:
  created:
    - apps/api/src/contexts/ordering/application/dto.ts
    - apps/api/src/contexts/ordering/application/create-order.service.ts
    - apps/api/src/contexts/ordering/application/get-order.service.ts
    - apps/api/src/contexts/ordering/infrastructure/order-drizzle.repository.ts
    - apps/api/test/integration/create-order-idempotency.spec.ts
  modified: []
decisions:
  - id: D-IDEM-REFACTOR
    description: Extracted private loadByIdWithTx helper in the repository to avoid nested withTenant calls from findByIdempotencyKey. The repository mirror in PATTERNS.md called this.findById() inside withTenant which would open a nested db.transaction — refactored to share the tx cleanly.
  - id: D-CATEGORYID-PLACEHOLDER
    description: "OrderItemSnapshot.categoryId is not stored in the order_items DB table (applyDiscount uses it at creation time only). On findById reconstruction, categoryId is set to empty string ''. This is intentional: the stored snapshot is for display/fulfillment, not for re-computing discounts."
  - id: D-PAID-REFUND-STUB
    description: "OrderPaid and OrderRefunded domainEventToEnvelope arms use placeholder total=0/currency=USD since those domain events don't carry the totals fields. These events are not reachable in Phase 7; Phase 8 will pass the correct values from the snapshot."
metrics:
  duration: 525s
  completed_date: '2026-06-14'
  tasks_completed: 3
  files_created: 5
  files_modified: 0
---

# Phase 07 Plan 04: Application + Infrastructure Layer Summary

**One-liner:** Idempotent order creation via composite `(tenant_id, idempotency_key)` conflict target with transactional outbox emit and ScopedTx+RLS double-enforcement on all child reads.

## What Was Built

### Task 1 — CreateOrderInput DTO + OrderResponse + generateOrderNumber (`ae312bc`)

`dto.ts` with the triple-export pattern (`CreateOrderInputSchema` / `CreateOrderInput` type / `CreateOrderInputDto` class). Inline `CartLineItemSchema` and `CartModifierSchema` mirror the `@resto/cart` shape (decimal-string prices) without importing the package. Cross-field refinements enforce D-02: `dine_in` requires `table`; `pickup`/`delivery` require `customerName` + `customerPhone`. Past `scheduledFor` is rejected. `DiscountSpecSchema` is imported from `domain/discount.ts` and reused — no redefinition. `OrderResponseSchema` and `generateOrderNumber()` (`YYYYMMDD-XXXXX` format) exported.

Exactly one comment in the file: the ORD-12 WHY at the operating-hours bypass.

### Task 2 — OrderDrizzleRepository (`24b968f`)

Full `OrderRepository` implementation:

- `save()`: drains `pullEvents()` once, inserts `orders` with `onConflictDoNothing({ target: [schema.orders.tenantId, schema.orders.idempotencyKey] })`. Empty `.returning()` → ORD-10 idempotent hit → early return (no child inserts, no outbox re-emit). On new insert: writes `order_items` + `order_modifiers` rows then appends the `OrderCreated` envelope to outbox — all in one `db.withTenant` transaction.
- `findById()` / `findByIdempotencyKey()`: both use a private `loadByIdWithTx` helper to avoid nested `db.withTenant` calls. Explicit `eq(schema.orders.tenantId, ...)`, `eq(schema.orderItems.tenantId, ...)`, and `eq(schema.orderModifiers.tenantId, ...)` filters on all three tables — ADR-0020 I-1 satisfied.
- Exhaustive `domainEventToEnvelope` switch for all 5 `OrderDomainEvent` kinds via `buildEnvelope`. No `EventEnvelope` literal. No `runInTenantContext`.

### Task 3 — create-order + get-order services + integration spec (`a8425e7`)

`create-order.service.ts`: validates all cart item currencies match, generates `orderNumber`, maps DTO items to domain `CreateOrderInput`, calls `Order.create()` → `repo.save()`. After save, loads the existing order via `repo.findByIdempotencyKey` to return the canonical `orderId`/`orderNumber` on both fresh creates and idempotency retries. `discountSpec` is wired through to `Order.create()` (PROMO-06).

`get-order.service.ts`: thin `findById` wrapper that throws `OrderNotFoundError` on miss. Used by Phase 10 status endpoint.

`create-order-idempotency.spec.ts`: 4 integration tests against a real Postgres testcontainer:

1. Duplicate key → same `orderId`, single `orders` row
2. Same key across two tenants → two independent orders
3. Retry produces exactly one `ordering.order_created.v1` outbox row
4. Items and modifiers rows are created correctly

All 4 tests pass (3090ms runtime with Docker).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Refactored findByIdempotencyKey to avoid nested withTenant calls**

- **Found during:** Task 2 implementation
- **Issue:** PATTERNS.md showed `findByIdempotencyKey` calling `this.findById()` inside a `withTenant` callback. `findById` opens its own `withTenant`, which opens a nested `db.transaction`. While postgres.js handles nested transactions via savepoints, combining this with `app_bind_tenant` GUC assertions creates fragile behavior.
- **Fix:** Extracted `private loadByIdWithTx(tx, id, tenantId)` helper; both `findById` and `findByIdempotencyKey` call it directly within their own single `withTenant` callback.
- **Files modified:** `order-drizzle.repository.ts`
- **Commit:** `24b968f`

**2. [Rule 1 - Bug] ESLint no-non-null-assertion in integration spec**

- **Found during:** Task 3 pre-commit hook
- **Issue:** Used `itemId!` non-null assertion in spec where ESLint rule `@typescript-eslint/no-non-null-assertion` disallows it.
- **Fix:** Guard with `if (!itemRow) return;` and reference `itemRow.id` directly.
- **Files modified:** `create-order-idempotency.spec.ts`
- **Commit:** `a8425e7`

### Design Choices (Planner Discretion)

- `OrderItemSnapshot.categoryId` is not stored in `order_items` table — set to `''` on reconstruction from DB. The field is only used by `applyDiscount` at creation time.
- `OrderPaid`/`OrderRefunded` `domainEventToEnvelope` arms use `total: 0, currency: 'USD'` placeholder values. These events are unreachable in Phase 7; Phase 8 will supply correct values from the snapshot.

## Known Stubs

None — all plan goal capabilities are wired end-to-end. The `categoryId: ''` placeholder in `loadByIdWithTx` is an intentional design choice (see decisions), not a data stub that breaks the plan goal.

## Threat Flags

None — no new trust boundaries introduced beyond those in the plan's threat model.

## Self-Check: PASSED

Files exist:

- `apps/api/src/contexts/ordering/application/dto.ts` ✓
- `apps/api/src/contexts/ordering/application/create-order.service.ts` ✓
- `apps/api/src/contexts/ordering/application/get-order.service.ts` ✓
- `apps/api/src/contexts/ordering/infrastructure/order-drizzle.repository.ts` ✓
- `apps/api/test/integration/create-order-idempotency.spec.ts` ✓

Commits exist: `ae312bc`, `24b968f`, `a8425e7` ✓

Acceptance greps:

- `grep -q 'schema.orders.idempotencyKey\]' ...repository.ts` → PASS
- `grep -cE '//|/\*' dto.ts` === 1 → PASS
- `grep -q "eq(schema.orderItems.tenantId" ...repository.ts` → PASS
- `grep -q "eq(schema.orderModifiers.tenantId" ...repository.ts` → PASS
- Integration spec: 4/4 tests green → PASS
