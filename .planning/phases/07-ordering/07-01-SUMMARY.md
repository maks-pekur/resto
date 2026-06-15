---
phase: '07'
plan: '01'
subsystem: ordering/domain
tags: [tdd, branded-ids, money-utils, discount-engine, promo-06, pure-functions]
dependency_graph:
  requires: []
  provides:
    - OrderId/OrderItemId branded types in @resto/domain
    - toMinorUnits/fromMinorUnits in ordering/domain/money-utils.ts
    - DiscountSpec discriminated union + applyDiscount() in ordering/domain/discount.ts
    - DiscountSpecSchema Zod schema for Plan 04 DTO reuse
  affects:
    - packages/domain/src/ids.ts
    - packages/domain/src/index.ts
    - apps/api/src/contexts/ordering/domain/
tech_stack:
  added: []
  patterns:
    - TDD RED/GREEN cycle per task
    - Zod union schema with nested discriminatedUnion per axis (kind/scope)
    - Integer minor-unit arithmetic — no parseFloat, no float drift
key_files:
  created:
    - apps/api/src/contexts/ordering/domain/money-utils.ts
    - apps/api/src/contexts/ordering/domain/money-utils.spec.ts
    - apps/api/src/contexts/ordering/domain/discount.ts
    - apps/api/src/contexts/ordering/domain/discount.spec.ts
  modified:
    - packages/domain/src/ids.ts
    - packages/domain/src/index.ts
decisions:
  - pct uses plain integer percentage (10 = 10%) not basis points; simpler and sufficient for Phase 7 PROMO-06 scope
  - DiscountSpecSchema uses z.union([PercentageDiscountSchema, FixedDiscountSchema]) with nested z.discriminatedUnion('scope') per kind — required because z.discriminatedUnion requires unique discriminant values and kind has two groups of three
  - applyDiscount last arms use ternary chain instead of nested if blocks to satisfy @typescript-eslint/no-unnecessary-condition after TypeScript narrows the union
  - ids.ts jsdoc block stripped (no-comments rule; block described only what the code already shows)
metrics:
  duration: '~12 minutes'
  completed: '2026-06-14'
  tasks_completed: 2
  files_changed: 6
---

# Phase 07 Plan 01: Ordering Domain Foundation Summary

Branded `OrderId`/`OrderItemId` identity types, ordering minor-unit money helpers, and the greenfield discount engine (PROMO-06) — pure TypeScript, zero infrastructure, full TDD coverage.

## Tasks Completed

| Task | Name                                                                   | Commit  | Files                                                                                         |
| ---- | ---------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| 1    | Branded OrderId/OrderItemId + ordering money-utils (TDD)               | 659e9a7 | packages/domain/src/ids.ts, packages/domain/src/index.ts, money-utils.ts, money-utils.spec.ts |
| 2    | Discount engine — DiscountSpec union + applyDiscount() (TDD, PROMO-06) | b1dbbc9 | discount.ts, discount.spec.ts                                                                 |

## What Was Built

**Task 1:** Added `OrderId` and `OrderItemId` branded Zod schemas to `packages/domain/src/ids.ts` following the existing `MenuItemId` shape exactly, both re-exported through `packages/domain/src/index.ts`. Created `money-utils.ts` with `toMinorUnits`/`fromMinorUnits` replicated verbatim from `packages/cart/src/cart.ts` `parseMinorUnits`/`formatMinorUnits` (renamed, not imported — module-boundary rule A7). 11 tests covering standard conversion, edge cases, and the `'0.10' + '0.20' = '0.30'` float-drift guard.

**Task 2:** Created `discount.ts` with the `DiscountSpec` discriminated union (6 members: percentage × {cart, category, item} and fixed × {cart, category, item}), the `OrderLineDraft` interface with integer `lineTotal`, `DiscountSpecSchema` Zod schema for downstream DTO validation, and the pure `applyDiscount()` function. All six arms clamp via `Math.max(0, Math.min(eligibleBase, computed))` — T-07-04 tamper mitigation. 14 tests covering all 6 variants, null spec, over-base clamp, and negative-clamp guards.

## Test Results

- `money-utils.spec.ts`: 11/11 passing
- `discount.spec.ts`: 14/14 passing
- `pnpm nx run domain:typecheck`: PASS
- `pnpm nx run api:typecheck`: PASS

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ESLint no-unnecessary-condition on discount.ts nested if-chains**

- **Found during:** Task 2 commit (pre-commit hook)
- **Issue:** TypeScript narrows `spec.scope` after earlier `if` branches, making the last `if (spec.scope === 'item')` always-true — ESLint `@typescript-eslint/no-unnecessary-condition` rejects it as an error.
- **Fix:** Refactored per-scope selection into a ternary chain (`spec.scope === 'cart' ? ... : spec.scope === 'category' ? ... : ...`). All 14 tests remain green.
- **Files modified:** `apps/api/src/contexts/ordering/domain/discount.ts`
- **Commit:** b1dbbc9

**2. [Rule 1 - Bug] z.discriminatedUnion rejects duplicate discriminant values**

- **Found during:** Task 2 first GREEN run
- **Issue:** `z.discriminatedUnion('kind', [...])` requires each union member to have a unique value for the discriminant. `'percentage'` appeared 3 times and `'fixed'` appeared 3 times — Zod threw at module load.
- **Fix:** Nested the schema into two inner `z.discriminatedUnion('scope', [...])` (one per `kind`), then wrapped with `z.union([PercentageDiscountSchema, FixedDiscountSchema])`. The inferred `DiscountSpec` TypeScript type is identical to the plan's intended shape.
- **Files modified:** `apps/api/src/contexts/ordering/domain/discount.ts`
- **Commit:** b1dbbc9

**3. [CLAUDE.md] Stripped jsdoc block from ids.ts**

- The existing `ids.ts` had a multi-line JSDoc comment explaining the branded-ID pattern. The no-comments rule in CLAUDE.md prohibits comments that restate what the code does. The block was removed when adding `OrderId`/`OrderItemId`.

## Known Stubs

None. Both files are pure logic with no placeholders or TODOs.

## Threat Flags

None. No new network endpoints, auth paths, file access, or schema changes introduced. All files are pure domain logic.

## Self-Check: PASSED

- `apps/api/src/contexts/ordering/domain/money-utils.ts` — FOUND
- `apps/api/src/contexts/ordering/domain/money-utils.spec.ts` — FOUND
- `apps/api/src/contexts/ordering/domain/discount.ts` — FOUND
- `apps/api/src/contexts/ordering/domain/discount.spec.ts` — FOUND
- `packages/domain/src/ids.ts` — FOUND (OrderId + OrderItemId)
- `packages/domain/src/index.ts` — FOUND (OrderId + OrderItemId exported)
- Commit 659e9a7 — FOUND
- Commit b1dbbc9 — FOUND
