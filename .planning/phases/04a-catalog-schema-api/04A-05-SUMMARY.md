---
phase: 04a-catalog-schema-api
plan: 05
subsystem: catalog
tags: [catalog, events, dto, zod, audit, errors]
dependency-graph:
  requires: [04A-04]
  provides: [04A-06, 04A-07]
  affects:
    - packages/events/src/index.ts
    - apps/api/src/contexts/catalog/application/dto.ts
    - apps/api/src/contexts/catalog/domain/errors.ts
    - apps/api/src/contexts/catalog/interfaces/http/error-mapping.ts
    - apps/api/src/contexts/audit/application/record-audit.service.ts
tech-stack:
  added: []
  patterns:
    - 'Event contract triple (Payload schema + inferred type + defineEventContract) per identity.ts analog'
    - 'Zod DTO schema with CAT-09 max-length constraints (255 / 100 / 500 / 1024)'
    - "Discriminated-union domain errors with 'kind' literal + exhaustive switch"
    - 'ACTION_TARGET_KIND projection map with targetType-keyed targetId resolver IIFE'
key-files:
  created:
    - packages/events/src/contracts/catalog.ts
  modified:
    - packages/events/src/index.ts
    - apps/api/src/contexts/catalog/application/dto.ts
    - apps/api/src/contexts/catalog/application/upsert-category.service.ts
    - apps/api/src/contexts/catalog/application/upsert-item.service.ts
    - apps/api/src/contexts/catalog/application/upsert-modifier.service.ts
    - apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts
    - apps/api/src/contexts/catalog/interfaces/http/error-mapping.ts
    - apps/api/src/contexts/catalog/domain/errors.ts
    - apps/api/src/contexts/audit/application/record-audit.service.ts
    - apps/api/test/unit/catalog/upsert-category.service.spec.ts
    - apps/api/test/unit/catalog/upsert-item.service.spec.ts
    - apps/api/test/unit/catalog/upsert-modifier.service.spec.ts
decisions: []
metrics:
  duration: ~25min
  completed: 2026-05-31
requirements: [CAT-02, CAT-04, CAT-05, CAT-09]
---

# Phase 04a Plan 05: Type Contracts (Events, DTOs, Errors, Audit Map) Summary

Phase 04a/Plan 05 lands the type-only contracts that plan 06 (services) and plan 07 (controllers + downstream consumers) will implement against: 4 new catalog event payloads, refactored Zod DTOs aligned with the iiko-aligned schema from plan 02/04, 3 new domain error classes wired into the exhaustive `CatalogDomainError` union and HTTP mapper, and 4 new entries in the audit projection map covering catalog menu/item events.

## What Was Done

### 1. Event contracts (`packages/events/src/contracts/catalog.ts` + re-export)

Created the new file `packages/events/src/contracts/catalog.ts` defining 4 event contracts using the identity.ts triple pattern (Payload Zod schema + inferred type alias + `defineEventContract` result):

| Contract               | Event type                        | Payload                                                                                              |
| ---------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `MenuFirstPublishedV1` | `catalog.menu_first_published.v1` | `{ tenantId, version: positive int }`                                                                |
| `MenuRepublishedV1`    | `catalog.menu_republished.v1`     | `{ tenantId, version: positive int }`                                                                |
| `ItemStoppedV1`        | `catalog.item_stopped.v1`         | `{ tenantId, itemId, itemSlug (max 120), stoppedByUserId (uuid \| null), stoppedAt (coerced date) }` |
| `ItemUnstoppedV1`      | `catalog.item_unstopped.v1`       | `{ tenantId, itemId, itemSlug (max 120), unstoppedByUserId (uuid \| null) }`                         |

All 8 named exports (4 `*V1` constants + 4 `*V1Payload` schemas) are re-exported from `packages/events/src/index.ts` in an alphabetically ordered block following the existing identity/tenancy re-export style. `apps/api` now imports them via `@resto/events`.

No `@nestjs/*` imports — `packages/events` is framework-free per the layering rule.

### 2. DTOs (`apps/api/src/contexts/catalog/application/dto.ts`)

Refactored in place. Final schema list (8 schemas total):

- `MenuItemPhotoSchema` — NEW. `s3Key` max 1024 with `^https?:` rejection refinement (T-04a-05-02 XSS guard); optional `alt` max 255; optional `width`/`height` positive ints; optional `isPrimary`.
- `UpsertCategoryInputSchema` — extended. `slug: Slug.optional()` for auto-derive; new `parentId: uuid | null default null` (CAT-01 nested-category support).
- `UpsertItemInputSchema` — refactored. Removed `imageS3Key`; added `photos: array(MenuItemPhotoSchema).max(20)`; BJU fields (`proteins`/`fats`/`carbs` as `number().min(0).max(999.99).nullable()`, `kcal` as int max 32000); provenance fields (`source` enum, `needsReview`, `sourceExternalId` max 255, `nutritionEstimated`); tightened `allergens` to `array(string min 1 max 100).max(50)`; `slug` made optional.
- `UpsertModifierGroupInputSchema` — RENAMED from `UpsertModifierInputSchema`. Same structural shape with `maxSelectable >= minSelectable` refinement.
- `UpsertModifierOptionInputSchema` — NEW. `modifierGroupId`, `priceDelta` (MoneyAmountValue), `defaultAmount`, `freeAmount`, `sortOrder` — matches iiko `defaultAmount` + `freeAmount` semantics (CAT-04).
- `UpsertItemSizeInputSchema` — NEW. `menuItemId`, `name`, `price` (absolute MoneyAmountValue, not a delta — Pitfall 6 + CAT-05), `isDefault`, `sortOrder`.
- `StopItemInputSchema` — NEW. `itemId` uuid, `reason` max 500 nullable (D-4a-10).

CAT-09 max-length sweep: every free-text `z.string()` carries an explicit `.max(N)` (or wraps an already-capped domain value object: `Slug` max 120, `LocalizedText` per-locale internal cap, `MoneyAmountValue` / `CurrencyValue`). DoS-via-unbounded-string vectors are closed at the HTTP boundary (T-04a-05-01).

### 3. Domain errors (`apps/api/src/contexts/catalog/domain/errors.ts`)

Added 3 error classes following the established `kind = '...' as const` discriminator + `name` assignment pattern:

- `MenuModifierGroupNotFoundError(groupId)`
- `MenuItemSizeNotFoundError(sizeId)`
- `StopListItemNotFoundError(itemId)`

Extended the `CatalogDomainError` discriminated-union type to include them. `error-mapping.ts` `mapKnown` switch was extended with three new `case` branches (all mapping to `NotFoundException` with distinct `code` strings: `catalog.menu_modifier_group_not_found`, `catalog.menu_item_size_not_found`, `catalog.stop_list_item_not_found`), and `isCatalogDomainError` `instanceof` chain was widened — the exhaustiveness check is preserved (`const exhaustive: never = err`).

### 4. Audit projection map (`apps/api/src/contexts/audit/application/record-audit.service.ts`)

Added 4 new entries to `ACTION_TARGET_KIND` after the `identity.password_reset_completed` line:

```ts
'catalog.menu_first_published': 'menu',
'catalog.menu_republished': 'menu',
'catalog.item_stopped': 'menu_item',
'catalog.item_unstopped': 'menu_item',
```

Refactored the `targetId` IIFE inside `project()` to be `targetType`-keyed. New branches:

- `targetType === 'menu_item'` reads `payload.itemId`.
- `targetType === 'menu'` reads `payload.tenantId` (RestOS menus are per-tenant 1:1, so tenantId is the canonical menu identity for audit cross-referencing).

Existing tenant/user resolution preserved as the fallback branch.

## Verification

- `pnpm exec nx run events:typecheck` → green.
- `pnpm exec nx run api:typecheck` → green (after the deviations below brought consumer files into compliance with the new DTO shape).
- All Task 1/2/3 acceptance grep checks pass:
  - 4 distinct `defineEventContract` calls in `catalog.ts`.
  - 8 named exports from `@resto/events` for the catalog contracts.
  - `MenuItemPhotoSchema`, `parentId`, `photos`, `nutritionEstimated`, `source` enum, `UpsertModifierGroupInputSchema`, `UpsertModifierOptionInputSchema`, `UpsertItemSizeInputSchema`, `StopItemInputSchema` all present in dto.ts.
  - `imageS3Key` and bare `UpsertModifierInputSchema` (without "Group") references in dto.ts: 0.
  - `defaultAmount: NonNegInt`, `freeAmount: NonNegInt` present in dto.ts.
  - 3 new error classes with `kind = '...' as const` discriminator + `CatalogDomainError` union membership.
  - 4 new entries in `ACTION_TARGET_KIND`.

## Deviations from Plan

### Auto-fixed Issues (Rule 3 — blocking issue)

**[Rule 3 — Blocking] Patched downstream services + tests to keep `apps/api` typecheck green**

- **Found during:** Task 2 commit (pre-commit hook runs `nx affected -t typecheck`).
- **Issue:** The plan's verification section explicitly states `pnpm --filter @resto/api typecheck` "is expected to FAIL" because plan 06 hasn't refactored services/repository/tests against the new DTO shape. However, the project's pre-commit hook enforces a green `nx affected -t typecheck` and the parent agent's invocation explicitly bans `--no-verify`.
- **Fix:** Minimum-surgical patches to bring `apps/api` typecheck green inline with this plan, without implementing all of plan 06's service refactor:
  - `upsert-category.service.ts`: `slug: input.slug ?? ''` to bridge the now-optional DTO slug into the row's `slug: string` invariant until plan 06's transliteration helper lands.
  - `upsert-item.service.ts`: same `slug` bridge + `imageS3Key: input.photos[0]?.s3Key ?? null` to keep the existing `UpsertItemRow` row shape (which still has `imageS3Key`) populated from the new `photos[]` DTO field. Plan 06 will replace the row shape directly.
  - `upsert-modifier.service.ts`: renamed type import from `UpsertModifierInput` to `UpsertModifierGroupInput`.
  - `internal-catalog.controller.ts`: renamed DTO import + decorator + body param from `UpsertModifierInputDto` to `UpsertModifierGroupInputDto`.
  - `error-mapping.ts`: extended `isCatalogDomainError` `instanceof` chain and added 3 new `case` branches to `mapKnown` — required for the `CatalogDomainError` union's exhaustiveness check (`never` assertion would otherwise fail).
  - `upsert-category.service.spec.ts` / `upsert-item.service.spec.ts` / `upsert-modifier.service.spec.ts`: updated test `baseInput` fixtures to include the new required fields (`parentId`, `photos`, BJU, source, etc.) and replaced one test that constructed `imageS3Key` directly with the equivalent `photos: [{ s3Key, sortOrder }]` shape. Assertions on the resulting repository call rows were not modified — they remained valid because the service-level bridge derives `imageS3Key` from `photos[0]?.s3Key`.
- **Files modified:** 8 files (4 services, 1 controller, 1 error-mapping, 3 specs).
- **Commits:** Folded into commit `1e28eb1` (Task 2: DTO refactor) and `db7bc04` (Task 3: errors + audit) — the bridging changes are inseparable from the DTO/error renames that triggered them.
- **Forward-compat note for plan 06:** The `slug: input.slug ?? ''` and `imageS3Key: input.photos[0]?.s3Key ?? null` bridges are temporary shims at the application-service layer. Plan 06 will:
  - Replace `?? ''` with a `transliterate(input.name.en)` call once the helper from plan 01 is wired.
  - Replace `imageS3Key: ...` derivation by widening `UpsertItemRow` to carry `photos: MenuItemPhoto[]` directly, dropping the `imageS3Key` column from the row entirely.

## Threat Flags

No new trust boundaries beyond the threat model documented in the plan's `<threat_model>` block. All STRIDE register mitigations (T-04a-05-01 through T-04a-05-07) are addressed by the implemented schemas.

## Self-Check: PASSED

- Files: all 6 claimed paths (1 created, 5 modified key files, 1 SUMMARY) exist on disk in the worktree.
- Commits: `fa13d9a` (Task 1), `1e28eb1` (Task 2), `db7bc04` (Task 3) all present in `git log --oneline --all`.

## Next Steps

- **Plan 04A-06** — refactor `catalog-drizzle.repository.ts` to implement the new repository ports against the new DTO/row shapes; introduce `transliteration` helper for slug auto-derive; widen `UpsertItemRow` to carry `photos[]` natively (removing the temporary `imageS3Key` bridge introduced here).
- **Plan 04A-07** — add the new HTTP endpoints (`POST /modifier-groups`, `POST /modifier-options`, `POST /item-sizes`, `POST /stop-list`, `DELETE /stop-list/:itemId`) and the delayed-publish service; consume the catalog event contracts in the audit consumer.
