---
phase: 07-ordering
plan: 03
subsystem: ordering/domain
tags: [aggregate, state-machine, tdd, domain-events, money-utils, discount]
dependency_graph:
  requires: [07-01]
  provides: [Order aggregate, OrderDomainEvent union, domain errors, OrderRepository port]
  affects: [07-04, 07-05, phase-08, phase-10]
tech_stack:
  added: []
  patterns: [aggregate-root, private-ctor-fromSnapshot-pullEvents, per-line-minor-unit-totals, drain-once-events]
key_files:
  created:
    - apps/api/src/contexts/ordering/domain/events.ts
    - apps/api/src/contexts/ordering/domain/errors.ts
    - apps/api/src/contexts/ordering/domain/ports.ts
    - apps/api/src/contexts/ordering/domain/order.aggregate.ts
    - apps/api/src/contexts/ordering/domain/order.aggregate.spec.ts
  modified: []
decisions:
  - D-01 honored: full 9-state machine implemented in one pass; all 8 transitions have real guards, status mutations, and event pushes — zero Phase-N comment stubs
  - markFailed emits OrderStatusChanged (not a dedicated OrderFailed event) with newStatus = 'failed:<reason>' — consistent with how the audit subscriber generically processes status changes
  - priceDelta: '0.005' in tests demonstrates per-line truncation to 2 decimal places before minor-unit conversion (toMinorUnits slices frac at 2 chars, so 0.5 sub-cent delta → 0 minor units); the divergence test confirms the per-line path produces a different result than round-at-total when a genuine fractional modifier accumulates across qty
  - Currency branded type (from @resto/domain) requires Currency.parse() in tests — spec uses a const USD = Currency.parse('USD') fixture
metrics:
  duration: ~25min
  completed_at: '2026-06-14T21:24:00Z'
  tasks_completed: 2
  files_created: 5
  files_modified: 0
---

# Phase 7 Plan 03: Order Aggregate — State Machine + Snapshot + Totals Summary

**One-liner:** Full 9-state Order aggregate with guarded transitions, drain-once domain events, immutable item/modifier/price snapshot (ORD-04), and per-line-rounded minor-unit totals via Plan 01 helpers (ORD-05) — 32 spec assertions, zero infra imports.

## Tasks Completed

| Task | Name                                                      | Commit  | Files                                       |
| ---- | --------------------------------------------------------- | ------- | ------------------------------------------- |
| 1    | Domain events union + errors + ports                      | b2936a9 | events.ts, errors.ts, ports.ts              |
| 2    | Order aggregate — state machine + snapshot + totals (TDD) | f8c506f | order.aggregate.ts, order.aggregate.spec.ts |

## What Was Built

**Task 1 — Supporting domain primitives:**

- `events.ts`: `OrderDomainEvent` discriminated union — 5 members (`OrderCreated`, `OrderPaid`, `OrderCanceled`, `OrderRefunded`, `OrderStatusChanged`). `OrderCreated` carries all 6 fields that `domainEventToEnvelope` in Plan 04 consumes: `brandId`, `orderNumber`, `fulfillmentMode`, `totalMinorUnits`, `currency`, `itemCount`.
- `errors.ts`: 4 error classes with `readonly kind = '...' as const` discriminant and explicit `this.name` — enables exhaustive switching in Plan 05's `error-mapping.ts`. Union type `OrderDomainError` exported.
- `ports.ts`: `OrderRepository` interface (`save`, `findById`, `findByIdempotencyKey`) + `ORDER_REPOSITORY = Symbol(...)`.

**Task 2 — Order aggregate (TDD):**

- `order.aggregate.ts`: Pure TypeScript aggregate root (no NestJS, no Drizzle, no @resto/db). Exports `OrderStatus` (9-member union), `OrderSnapshot`, `OrderItemSnapshot`, `OrderModifierSnapshot`, `CreateOrderInput`, and `Order` class.
- Private constructor + `static fromSnapshot` + `static create` + `toSnapshot` + `pullEvents` (drains exactly once).
- All 8 transitions implemented with real guards: `markPaid` (created→paid), `accept` (paid→accepted), `startPreparing` (accepted→preparing), `markReady` (preparing→ready), `complete` (ready→completed), `cancel` (created|paid→canceled), `refund` (paid→refunded), `markFailed` (created|paid→failed). Each: validates source status, mutates snapshot, pushes domain event. 8 `throw new InvalidOrderTransitionError` calls, 0 `/* Phase */` stubs.
- `computeTotals` helper: converts each line's `unitPrice` + modifier `priceDelta` via `toMinorUnits`, rounds per-line (`Math.round(unitMinor + modifierMinor) * quantity`), sums to subtotal, feeds `applyDiscount` for discount, computes `total = max(0, subtotal - discount)`, converts back via `fromMinorUnits`.
- `order.aggregate.spec.ts`: 32 passing assertions covering all behavioral requirements.

## Acceptance Criteria Result

| Criterion                                                                                   | Result |
| ------------------------------------------------------------------------------------------- | ------ |
| `throw new InvalidOrderTransitionError` count ≥ 7                                           | 8      |
| `/* Phase` stub count === 0                                                                 | 0      |
| All 8 transition methods present                                                            | 8      |
| OrderCreated carries brandId/orderNumber/fulfillmentMode/totalMinorUnits/currency/itemCount | PASS   |
| No @nestjs/drizzle-orm/@resto/db imports in aggregate                                       | CLEAN  |
| 32 spec assertions green                                                                    | PASS   |
| `pnpm nx run api:typecheck`                                                                 | PASS   |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ports.ts circular import on typecheck**

- **Found during:** Task 1 verification
- **Issue:** `ports.ts` imports `Order` from `./order.aggregate` which didn't exist yet; typecheck failed with TS2307
- **Fix:** Created `order.aggregate.ts` alongside Task 1 files (rather than as a separate step) so all Task 1 files could typecheck together. The aggregate content is identical to what Task 2 specifies — no behavioral difference, just sequence compression.
- **Files modified:** order.aggregate.ts (created early)

**2. [Rule 1 - Bug] `import type { OrderId, TenantId, type Currency }` redundant type modifier**

- **Found during:** Task 1 typecheck
- **Issue:** TS2206 error: `type` modifier on named import inside `import type` statement
- **Fix:** Removed redundant `type` keyword before `Currency` in events.ts import
- **Files modified:** events.ts

**3. [Rule 1 - Bug] ESLint no-non-null-assertion in spec**

- **Found during:** Task 2 commit (pre-commit hook)
- **Issue:** 31 `events[0]!` non-null assertions in spec file violated `@typescript-eslint/no-non-null-assertion`
- **Fix:** Replaced all with `const [event] = events; expect(event).toBeDefined(); if (!event) return;` guard pattern
- **Files modified:** order.aggregate.spec.ts

**4. [Rule 1 - Bug] Currency branded type in spec**

- **Found during:** Task 2 typecheck
- **Issue:** `'USD' as const` is not assignable to `string & BRAND<'Currency'>` — 9 typecheck errors
- **Fix:** Added `const USD = Currency.parse('USD')` fixture at spec top; replaced all occurrences
- **Files modified:** order.aggregate.spec.ts

## Known Stubs

None — all transitions are fully implemented per D-01.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. This plan is pure domain — no HTTP surface, no DB interaction, no event publishing.

## Self-Check: PASSED

Files exist:

- apps/api/src/contexts/ordering/domain/events.ts: FOUND
- apps/api/src/contexts/ordering/domain/errors.ts: FOUND
- apps/api/src/contexts/ordering/domain/ports.ts: FOUND
- apps/api/src/contexts/ordering/domain/order.aggregate.ts: FOUND
- apps/api/src/contexts/ordering/domain/order.aggregate.spec.ts: FOUND

Commits exist:

- b2936a9: FOUND
- f8c506f: FOUND
