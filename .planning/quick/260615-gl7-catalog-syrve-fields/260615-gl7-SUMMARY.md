---
quick_id: 260615-gl7
slug: catalog-syrve-fields
phase: quick
type: quick
status: complete
date: 2026-06-15
tags: [catalog, syrve, iiko, schema, migration]
dependency_graph:
  requires: []
  provides: [syrve-field-alignment]
  affects: [catalog, public-menu, api-client]
tech_stack:
  added: []
  patterns:
    [nullable-column-extension, partial-unique-index, additive-dto-extension]
key_files:
  created:
    - packages/db/migrations/0050_catalog_syrve_fields.sql
  modified:
    - packages/db/migrations/meta/_journal.json
    - packages/db/src/schema/menu.ts
    - packages/domain/src/schema/menu-category.ts
    - packages/domain/src/schema/menu-item.ts
    - packages/domain/src/schema/menu-modifier.ts
    - packages/domain/src/schema/index.ts
    - packages/domain/src/index.ts
    - apps/api/src/contexts/catalog/application/dto.ts
    - apps/api/src/contexts/catalog/application/upsert-category.service.ts
    - apps/api/src/contexts/catalog/application/upsert-item.service.ts
    - apps/api/src/contexts/catalog/application/upsert-modifier-option.service.ts
    - apps/api/src/contexts/catalog/domain/ports.ts
    - apps/api/src/contexts/catalog/domain/published-menu.ts
    - apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts
    - apps/api/src/contexts/catalog/interfaces/http/public-menu.controller.ts
    - docs/api/openapi.yaml
    - packages/api-client/src/generated/api.ts
    - packages/domain/test/schema.spec.ts
    - apps/api/test/e2e/catalog.e2e.spec.ts
    - apps/api/test/unit/catalog/get-menu-item.service.spec.ts
    - apps/api/test/unit/catalog/upsert-category.service.spec.ts
    - apps/api/test/unit/catalog/upsert-item.service.spec.ts
decisions:
  - weight stored as numeric(10,3) string in DB and on wire (same as proteins/fats/carbs pattern) to avoid float rounding
  - measureUnit as text column with DB CHECK rather than Postgres enum to keep additive migration clean
  - MenuModifierOption domain schema added to packages/domain (was missing — options were projection-only before)
  - MeasureUnit exported from @resto/domain public barrel for downstream consumers
metrics:
  duration: 52m
  completed: 2026-06-15
  tasks_completed: 4
  files_modified: 22
---

# Quick Task 260615-gl7: Align catalog schema with Syrve `/api/1/nomenclature` Summary

**One-liner:** Additive Syrve field alignment — `code` (SKU) on category + item, `weight` + `measureUnit` on item, `minAmount`/`maxAmount` on modifier option — wired DB→domain→DTO→repository→public menu read with migration 0050 and full round-trip tests.

## Tasks Completed

| #   | Name                                                   | Commit    | Key Files                                                                     |
| --- | ------------------------------------------------------ | --------- | ----------------------------------------------------------------------------- |
| 1   | DB schema + migration 0050                             | `9280910` | `0050_catalog_syrve_fields.sql`, `menu.ts` (schema), `_journal.json`          |
| 2   | Domain Zod schemas                                     | `4fd323d` | `menu-category.ts`, `menu-item.ts`, `menu-modifier.ts`, domain barrel         |
| 3   | Application DTOs + services + repository + public read | `1232097` | `dto.ts`, 3 services, `ports.ts`, `published-menu.ts`, repository, controller |
| 4   | OpenAPI + api-client + full test pass                  | `d555345` | `openapi.yaml`, `api.ts` (generated), e2e + domain tests                      |

## What Was Built

Three field groups, all additive/nullable:

**Group 1 — SKU `code`:**

- `menu_categories.code text` nullable + partial unique index `menu_categories_brand_code_uq (tenant_id, brand_id, code) WHERE code IS NOT NULL`
- `menu_items.code text` nullable + partial unique index `menu_items_brand_code_uq` (same shape)
- Maps to Syrve `ProductsGroupInfo.code` / `ProductInfo.code`

**Group 2 — Weight/unit on items:**

- `menu_items.weight numeric(10,3)` nullable with `CHECK weight IS NULL OR weight >= 0`
- `menu_items.measure_unit text` nullable with `CHECK measure_unit IS NULL OR measure_unit IN ('g','kg','ml','l','pcs')`
- Maps to Syrve `ProductInfo.weight` / `measureUnit`
- Domain: `MeasureUnit = z.enum(['g','kg','ml','l','pcs'])` exported from `@resto/domain`

**Group 3 — Per-option quantity limits:**

- `menu_modifier_options.min_amount smallint` nullable + `CHECK min_amount IS NULL OR min_amount >= 0`
- `menu_modifier_options.max_amount smallint` nullable + `CHECK min_amount IS NULL OR max_amount IS NULL OR max_amount >= min_amount`
- Maps to Syrve `SimpleModifierInfo.minAmount/maxAmount` (per-option, distinct from group-level min/max_selectable)

All fields exposed on `GET /v1/menu` and `GET /v1/menu/items/:id` response shapes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Domain schema test fixtures missing new required fields**

- **Found during:** Task 4
- **Issue:** `packages/domain/test/schema.spec.ts` had `MenuCategory` and `MenuItem` fixtures without `code`/`weight`/`measureUnit`, causing 2 test failures
- **Fix:** Added null values for new fields in the `valid` fixture objects
- **Files modified:** `packages/domain/test/schema.spec.ts`
- **Commit:** `d555345`

**2. [Rule 1 - Bug] Unit test fixtures missing new required fields in UpsertItemInput and UpsertCategoryInput**

- **Found during:** Task 3 typecheck
- **Issue:** 3 unit test files had `baseInput` objects missing `code`, `weight`, `measureUnit` (category) and `code` (item), causing 15 TS errors
- **Fix:** Added null-defaulted fields to test fixtures and expected call assertions
- **Files modified:** `upsert-category.service.spec.ts`, `upsert-item.service.spec.ts`, `get-menu-item.service.spec.ts`
- **Commit:** `1232097`

**3. [Rule 1 - Bug] ESLint dot-notation + non-nullable-type-assertion errors in new ETag test**

- **Found during:** Task 4 commit hook
- **Issue:** `r1.headers['etag'] as string` violated `@typescript-eslint/dot-notation` and `non-nullable-type-assertion-style`
- **Fix:** Rewrote ETag access as `r1.headers.etag` with `expect(typeof etag1).toBe('string')` guard (pattern from `menu-brand-response.e2e.spec.ts`)
- **Files modified:** `catalog.e2e.spec.ts`
- **Commit:** `d555345`

**4. [Rule 2 - Missing functionality] Added `MenuModifierOption` domain schema**

- **Found during:** Task 2 — the plan said "modifier option: minAmount/maxAmount nonneg int nullable, with a refine max >= min when both present" in the domain layer
- **Issue:** No `MenuModifierOption` schema existed in `@resto/domain`; options were purely a repository projection
- **Fix:** Added `MenuModifierOption` schema to `menu-modifier.ts` and exported it from the domain barrel alongside `MeasureUnit`
- **Files modified:** `menu-modifier.ts`, `schema/index.ts`, `src/index.ts`
- **Commit:** `4fd323d`

**5. [Additive] openapi.yaml also picked up ordering module endpoints**

- **Found during:** Task 4 `openapi:check`
- **Reason:** The ordering module (Phase 7) had been added to the API but `openapi:emit` hadn't been run since then — the check detected drift. The emit regenerated the full spec including both Syrve fields and ordering endpoints. This is correct and expected per the check tool's design.
- **Commit:** `d555345`

## Test Coverage

- **Unit:** 428 tests passing (domain: 99, api: 428 — includes updated fixtures)
- **E2E tests added** (Docker-guarded, run when `isDockerAvailable()` returns true):
  - Syrve fields round-trip: code/weight/measureUnit on category + item upsert → `/v1/menu`
  - minAmount/maxAmount round-trip on modifier option → `/v1/menu`
  - Validation rejection: `measureUnit` outside enum → 400
  - Validation rejection: modifier `maxAmount < minAmount` → 400
  - Validation rejection: negative `weight` → 400
  - Unique constraint: duplicate `code` within same brand → 409
  - ETag/menu version counter still advances correctly after publish

## Known Stubs

None. All fields flow from HTTP input through to public menu read response.

## Threat Flags

None. These are additive nullable columns on existing tenant-scoped tables already protected by RLS + ScopedTx. No new network endpoints or auth paths introduced. The partial unique index is purely intra-tenant (scoped by `tenant_id, brand_id`).

## Self-Check

- [x] Migration file `0050_catalog_syrve_fields.sql` created
- [x] Journal entry idx 50 appended to `_journal.json`
- [x] DB schema (`menu.ts`) updated with all new columns, checks, and partial indexes
- [x] Domain schemas updated (`menu-category.ts`, `menu-item.ts`, `menu-modifier.ts`)
- [x] `MeasureUnit` and `MenuModifierOption` exported from `@resto/domain` barrel
- [x] Application DTOs updated (`dto.ts`) with new nullable fields + refine for minAmount/maxAmount
- [x] Port interfaces updated (`ports.ts`, `published-menu.ts`)
- [x] All 3 upsert paths in repository updated (insert-with-id, update-with-id, slug-based upsert)
- [x] `loadPublishedMenu` and `findPublishedItem` include new fields
- [x] `public-menu.controller.ts` response schemas include new fields
- [x] `openapi.yaml` regenerated — new fields present at `/v1/menu*`
- [x] `api-client` codegen ran — `generated/api.ts` in sync
- [x] 428 unit tests pass, 0 failures
- [x] 99 domain tests pass, 0 failures
- [x] Full typecheck: domain, db, events, api, admin, api-client, website, qr-menu all green
- [x] ZERO code comments added

## Self-Check: PASSED
