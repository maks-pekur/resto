---
phase: quick-260626-mzp
plan: 01
subsystem: catalog
tags: [security, multi-brand, catalog, e2e]
dependency_graph:
  requires: []
  provides: [brand-scoped catalog reads]
  affects: [catalog-drizzle.repository, get-draft-diff.service, list-modifier-groups.service, get-stop-list.service, catalog.controller]
tech_stack:
  added: []
  patterns: [brand predicate on scoped.selectFrom, requireBrandContext threading]
key_files:
  created: []
  modified:
    - apps/api/src/contexts/catalog/domain/ports.ts
    - apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts
    - apps/api/src/contexts/catalog/application/get-draft-diff.service.ts
    - apps/api/src/contexts/catalog/application/list-modifier-groups.service.ts
    - apps/api/src/contexts/catalog/application/get-stop-list.service.ts
    - apps/api/src/contexts/catalog/interfaces/http/catalog.controller.ts
    - apps/api/test/e2e/catalog.e2e.spec.ts
decisions:
  - brand predicate added as second arg to scoped.selectFrom, mirroring listStoppedItemIds/archiveItem pattern
  - requireBrandContext() called in each service after requireTenantContext(), brandId threaded into repo call
  - @RequireBrand() placed directly under @Permissions on getDraftDiff route, matching archiveItem decorator stack
metrics:
  duration: ~10min
  completed: 2026-06-26
---

# Quick Task 260626-mzp: Fix 3 Cross-Brand Catalog Read Leaks Summary

**One-liner:** Brand-filter `computeDraftDiff` / `listModifierGroups` / `listStopListWithStoppedAt` repo reads + gate `draft-diff` route with `@RequireBrand()`, proven by 2-brand cross-brand isolation e2e.

## Tasks

| #   | Name                                                   | Commit  | Files                                                                                                                                                |
| --- | ------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Brand-filter the three catalog reads + gate draft-diff | b810944 | ports.ts, catalog-drizzle.repository.ts, get-draft-diff.service.ts, list-modifier-groups.service.ts, get-stop-list.service.ts, catalog.controller.ts |
| 2   | 2-brand cross-brand isolation e2e for all three reads  | a098c64 | catalog.e2e.spec.ts                                                                                                                                  |

## What Changed

**Task 1 — code changes:**

- `domain/ports.ts`: `listModifierGroups()` → `listModifierGroups(brandId: string)`, `listStopListWithStoppedAt()` → `listStopListWithStoppedAt(brandId: string)`, `computeDraftDiff({ tenantId })` → `computeDraftDiff({ tenantId, brandId: string })`.
- `catalog-drizzle.repository.ts` `listModifierGroups` (~1143): added `eq(schema.menuModifierGroups.brandId, brandId)` as second arg to `scoped.selectFrom`.
- `catalog-drizzle.repository.ts` `listStopListWithStoppedAt` (~1206): added `eq(schema.menuStopList.brandId, brandId)` as second arg to `scoped.selectFrom`.
- `catalog-drizzle.repository.ts` `computeDraftDiff` (~1262): added `eq(schema.menuItems.brandId, input.brandId)` as second arg to `scoped.selectFrom`.
- `get-draft-diff.service.ts`: imported `requireBrandContext` from `@resto/db`; resolved `brandId` after `requireTenantContext()`; passed `{ tenantId, brandId }` to `computeDraftDiff`.
- `list-modifier-groups.service.ts`: imported `requireBrandContext`; resolved `brandId`; passed to `listModifierGroups(brandId)`.
- `get-stop-list.service.ts`: imported `requireBrandContext`; resolved `brandId`; passed to `listStopListWithStoppedAt(brandId)`.
- `catalog.controller.ts` `getDraftDiff`: added `@RequireBrand()` decorator directly under `@Permissions({ menu: ['read'] })`.

**Task 2 — new e2e test:**

Added `it('draft-diff / modifier-groups / stop-list return only the requesting brand rows', ...)` (60 s timeout) to `catalog.e2e.spec.ts`. Seeds one tenant with two brands (Brand A = default headers, Brand B = overridden `x-brand-slug`). Asserts as Brand A:

- `GET /v1/catalog/draft-diff` → contains A's draft item id, excludes B's.
- `GET /v1/catalog/modifier-groups` → contains A's group id, excludes B's.
- `GET /v1/catalog/stop-list` → contains A's stopped itemId, excludes B's.
- `GET /v1/catalog/draft-diff` without `x-brand-slug` → 403.

## Verification

- `pnpm --filter @resto/api exec tsc --noEmit -p tsconfig.json`: PASS
- `cd apps/api && npx vitest run test/e2e/catalog.e2e.spec.ts`: **26/26 passed** (new cross-brand spec included, zero regressions)
- Grep confirms brand predicates in `computeDraftDiff` (line 1262), `listModifierGroups` (line 1143), `listStopListWithStoppedAt` (line 1206) in the repository.
- No publish/version/event files touched.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. All three threats mitigated as planned: T-mzp-01 (draft-diff leak), T-mzp-02 (modifier-groups leak), T-mzp-03 (stop-list leak), T-mzp-04 (missing brand gate on draft-diff).
