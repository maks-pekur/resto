---
phase: 04a-catalog-schema-api
verified: 2026-05-31T09:50:00Z
status: passed
score: 19/19 must-haves verified
overrides_applied: 0
re_verification: # No previous VERIFICATION.md
  previous_status: none
gaps: []
human_verification: []
---

# Phase 04a: Catalog Schema + API Verification Report

**Phase Goal:** Land the iiko-aligned catalog schema redesign (BJU + photos JSONB + source provenance + slug auto-derive + alias rows + stop-list overlay + modifier groups + item sizes + delayed-publish revert + first-publish detection + Redis fallback) end-to-end across DB → events → DTOs → services → repository → HTTP → e2e → OpenAPI, closing CAT-02, CAT-04, CAT-05, CAT-06, CAT-09, CAT-10.

**Verified:** 2026-05-31T09:50:00Z
**Status:** passed
**Re-verification:** No (initial verification)

## Goal Achievement

### Observable Truths (Roadmap Success Criteria + Aggregated Plan Must-Haves)

| #   | Truth                                                                                                                                                              | Status   | Evidence                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `04A-SCHEMA-MAP.md` exists and maps every iiko entity → RestOS entity                                                                                              | VERIFIED | File present in phase dir; ROADMAP SC#1                                                                                                                     |
| 2   | Drizzle migration is idempotent + composite-FK + RLS preserved (ROADMAP SC#2)                                                                                      | VERIFIED | 13 migrations (0029–0041); pnpm db:audit-fks reports no I-2 violations (per 02/03/04/06 SUMMARYs)                                                           |
| 3   | `UpsertItemInputSchema` extended with BJU + source enum + photos array + slug auto-derive + slug_aliases table (ROADMAP SC#3)                                      | VERIFIED | dto.ts: 18 grep matches for new fields; `imageS3Key` count = 0; `MenuItemPhotoSchema` present; `source: z.enum(...)` present                                |
| 4   | Modifier vs Modifier Group separated; size as own entity; stop-list shape decided (ROADMAP SC#4)                                                                   | VERIFIED | `menuModifierGroups`, `menuItemModifierGroups`, `menuItemSizes`, `menuStopList` all exported (menu.ts lines 158, 198, 273, 312)                             |
| 5   | Delayed-publish revert (5s window); first-publish vs republish distinct events; Redis nextval fallback (ROADMAP SC#5)                                              | VERIFIED | `DelayedPublishService` (5_000 ms); `MenuFirstPublishedV1` + `MenuRepublishedV1` contracts; `nextval('menu_versions_seq')` in adapter                       |
| 6   | Public `/v1/menu` DTO contains all new fields; `docs/api/openapi.yaml` regen + CI drift-check (ROADMAP SC#6)                                                       | VERIFIED | openapi.yaml: 5 new endpoints, 10 grep matches for new fields, 0 `imageS3Key`; `pnpm openapi:check` exits 0; CI workflow gate                               |
| 7   | `transliteration@2.6.1` installed in `apps/api`                                                                                                                    | VERIFIED | `apps/api/package.json` line 43; consumed by `slug-util.ts`                                                                                                 |
| 8   | `menu_items` extended with photos JSONB + BJU + provenance; `image_s3_key` dropped                                                                                 | VERIFIED | Schema (menu.ts L99–L110); migrations 0029+0030 applied                                                                                                     |
| 9   | `menu_categories.parent_id` + composite tenant self-FK ON DELETE RESTRICT                                                                                          | VERIFIED | menu.ts L40 + migration 0031 (`menu_categories_parent_fk`)                                                                                                  |
| 10  | `tenants.menu_first_published_at` nullable column; `menu_versions_seq` Postgres sequence                                                                           | VERIFIED | tenants.ts L38; migrations 0032, 0033                                                                                                                       |
| 11  | `menu_stop_list` + `menu_item_slug_aliases` tables: composite FK + RLS ENABLE + FORCE + iso policies + CHECK on slug format                                        | VERIFIED | Migrations 0034 + 0035 + 0036 (2× `ENABLE ROW LEVEL SECURITY`, 2× `FORCE`, 2× `CREATE POLICY`)                                                              |
| 12  | `menu_variants` → `menu_item_sizes` (with absolute price); `menu_modifiers` → `menu_modifier_groups`; `menu_item_modifiers` → `menu_item_modifier_groups`          | VERIFIED | Migrations 0037, 0038; `modifier_id` → `modifier_group_id` rename present (2 occurrences); schema TS renamed                                                |
| 13  | `menu_modifier_options.default_amount` + `free_amount` SMALLINT (iiko `NPModifierModel` alignment)                                                                 | VERIFIED | Migration 0039 ADD COLUMN (2 grep matches); schema TS includes `defaultAmount`/`freeAmount`                                                                 |
| 14  | 4 new event contracts: `MenuFirstPublishedV1`, `MenuRepublishedV1`, `ItemStoppedV1`, `ItemUnstoppedV1`                                                             | VERIFIED | `packages/events/src/contracts/catalog.ts` defines all 4 with `defineEventContract`; re-exported from index.ts (8 grep matches)                             |
| 15  | `ACTION_TARGET_KIND` has 4 new catalog event entries; `targetId` IIFE handles `menu` + `menu_item`                                                                 | VERIFIED | `record-audit.service.ts`: 4 grep matches for the 4 new event-type prefixes                                                                                 |
| 16  | 3 new domain errors with `kind` discriminator + exhaustive switch in error-mapping.ts                                                                              | VERIFIED | errors.ts: `MenuModifierGroupNotFoundError`, `MenuItemSizeNotFoundError`, `StopListItemNotFoundError`; error-mapping.ts uses 3 case branches                |
| 17  | `PublishMenuService.doPublish` uses `db.withTenant` / `withTenantId` + `buildEnvelope` + `appendToOutbox` in same tx (ADR-0020 I-4 + I-6)                          | VERIFIED | `catalog-drizzle.repository.ts` `finalizeMenuPublish`: probes ALS → calls `withTenant` (ALS) or `withTenantId` (explicit); uses `buildEnvelope` x2          |
| 18  | `RedisCatalogCacheAdapter.bump()` falls back to `nextval('menu_versions_seq')` via `db.withoutTenant('menu version nextval fallback — Redis unavailable', ...)`    | VERIFIED | adapter.ts L80–L103: `#nextvalBump` uses `db.withoutTenant(...)` with exact reason string; allowlist updated (`packages/db/src/withoutTenant.allowlist.ts`) |
| 19  | HTTP surface complete: POST /modifier-groups, POST /modifier-options, POST /item-sizes, POST /stop-list, DELETE /stop-list/:itemId, POST /publish, DELETE /publish | VERIFIED | internal-catalog.controller.ts has all 9 endpoints (5 new + refactored publish + new DELETE publish)                                                        |

**Score:** 19/19 truths verified

### Required Artifacts

| Artifact                                                                                                               | Expected                                                                                  | Status   | Details                                                                              |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| `apps/api/package.json`                                                                                                | transliteration 2.6.1                                                                     | VERIFIED | Exact pin found                                                                      |
| `packages/db/src/schema/menu.ts`                                                                                       | New tables + renamed entities + MenuItemPhoto interface                                   | VERIFIED | 9 grep matches for new entities                                                      |
| `packages/db/src/schema/tenants.ts`                                                                                    | menuFirstPublishedAt column                                                               | VERIFIED | L38                                                                                  |
| `packages/db/migrations/0029…0036_catalog_phase4a_*.sql`                                                               | 8 migrations (items extend, drop, categories, tenants, seq, stop-list, slug-aliases, RLS) | VERIFIED | All 8 files exist                                                                    |
| `packages/db/migrations/0037…0039_catalog_phase4a_*.sql`                                                               | 3 rename + extend migrations                                                              | VERIFIED | All 3 files exist with expected ALTER patterns                                       |
| `packages/db/migrations/0040_catalog_phase4a_grant_delete_stop_list.sql`                                               | GRANT DELETE on menu_stop_list                                                            | VERIFIED | DO-block guarded GRANT present                                                       |
| `packages/db/migrations/0041_tenancy_erase_phase4a_tables.sql`                                                         | DROP+RECREATE tenancy_erase_tenant with renamed tables                                    | VERIFIED | All 6 catalog DELETEs (sized/groups/options/junction/stop-list/slug-aliases) present |
| `packages/events/src/contracts/catalog.ts`                                                                             | 4 event contracts                                                                         | VERIFIED | All 4 types + `defineEventContract` calls                                            |
| `apps/api/src/contexts/catalog/application/dto.ts`                                                                     | New + refactored Zod DTOs (8 schemas)                                                     | VERIFIED | All present; `imageS3Key` count = 0                                                  |
| `apps/api/src/contexts/catalog/application/delayed-publish.service.ts`                                                 | 5s in-memory timer per tenant + OnModuleDestroy                                           | VERIFIED | `#DELAY_MS = 5_000` + OnModuleDestroy + cancelPending                                |
| `apps/api/src/contexts/catalog/application/publish-menu.service.ts`                                                    | execute() + doPublish() + finalizeMenuPublish delegation                                  | VERIFIED | Refactored per ESLint policy (tx.\* in repo)                                         |
| `apps/api/src/contexts/catalog/application/stop-list.service.ts`                                                       | stop/unstop + outbox + cache invalidate                                                   | VERIFIED | 5+ key wiring matches                                                                |
| `apps/api/src/contexts/catalog/application/upsert-{category,item,modifier-group,modifier-option,item-size}.service.ts` | 5 services exist                                                                          | VERIFIED | All files exist; slug auto-derive in category + item                                 |
| `apps/api/src/contexts/catalog/application/slug-util.ts`                                                               | normalizeSlug + deriveSlugFromName using `transliteration`                                | VERIFIED | slugify import + normalizeSlug + deriveSlugFromName                                  |
| `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts`                                           | Refactored against new schema; signPhotos; stop-list overlay; finalizeMenuPublish         | VERIFIED | 0 grep matches for old table names; new method `finalizeMenuPublish` present         |
| `apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts`                                          | nextval fallback + invalidate method                                                      | VERIFIED | All wiring present                                                                   |
| `apps/api/src/contexts/catalog/catalog.module.ts`                                                                      | 5 new services registered                                                                 | VERIFIED | 10 grep matches for new providers                                                    |
| `apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts`                                         | 9 endpoints                                                                               | VERIFIED | All POST/DELETE decorators present                                                   |
| `apps/api/src/contexts/catalog/interfaces/http/error-mapping.ts`                                                       | 3 new error cases                                                                         | VERIFIED | 3 case branches + 3 code strings                                                     |
| `apps/api/src/contexts/catalog/domain/errors.ts`                                                                       | 3 new error classes + union extension                                                     | VERIFIED | All classes export with kind discriminator                                           |
| `apps/api/src/contexts/audit/application/record-audit.service.ts`                                                      | 4 new ACTION_TARGET_KIND entries                                                          | VERIFIED | 4 grep matches                                                                       |
| `apps/qr-menu/src/api/types.ts`                                                                                        | photos[], BJU, sizes, modifierGroups + DTO types                                          | VERIFIED | 7 grep matches                                                                       |
| `docs/api/openapi.yaml`                                                                                                | Regenerated; new endpoints + DTOs; no imageS3Key                                          | VERIFIED | 5 new endpoints, 10 grep matches for new fields, 0 imageS3Key                        |
| `packages/api-client/src/generated/api.ts`                                                                             | Regenerated; no imageS3Key; photos present                                                | VERIFIED | 0 imageS3Key, 3 photos matches                                                       |
| `tools/openapi-check.ts` + root `pnpm openapi:check`                                                                   | Drift-check script + script entry                                                         | VERIFIED | File exists; script registered in package.json                                       |
| `.github/workflows/ci.yml`                                                                                             | `openapi:check` CI gate                                                                   | VERIFIED | 4 grep matches for openapi:check                                                     |
| `packages/db/test/integration/tenant-isolation.spec.ts`                                                                | Extended cross-tenant matrix for 5 new entities                                           | VERIFIED | 33 grep matches for new entity names                                                 |
| `apps/api/test/e2e/catalog.e2e.spec.ts`                                                                                | New e2e cases (photos, stop-list, publish/undo, slug-alias)                               | VERIFIED | 18 grep matches including 0 `imageS3Key:` payloads (only the negative assertion)     |
| `packages/db/src/withoutTenant.allowlist.ts`                                                                           | redis-catalog-cache entry                                                                 | VERIFIED | 1 grep match                                                                         |

### Key Link Verification

| From                                          | To                                         | Via                               | Status | Details                                                                       |
| --------------------------------------------- | ------------------------------------------ | --------------------------------- | ------ | ----------------------------------------------------------------------------- |
| `InternalCatalogController.publish`           | `DelayedPublishService.schedule`           | service injection                 | WIRED  | controller.ts L173 + DI                                                       |
| `DelayedPublishService.setTimeout`            | `PublishMenuService.doPublish`             | 5s timer callback                 | WIRED  | delayed-publish.service.ts L47 calls publisher.doPublish(tenantId) explicitly |
| `PublishMenuService.doPublish`                | `CatalogRepository.finalizeMenuPublish`    | repository call                   | WIRED  | publish-menu.service.ts L55 delegates same-tx orchestration                   |
| `finalizeMenuPublish`                         | `appendToOutbox(buildEnvelope(...))`       | same-tx outbox emit               | WIRED  | catalog-drizzle.repository.ts L689–L695 — both branches use `buildEnvelope`   |
| `StopListService.stop`                        | `appendToOutbox(ItemStoppedV1)`            | same-tx outbox emit               | WIRED  | stop-list.service.ts L54–L62                                                  |
| `StopListService.stop/unstop`                 | `CatalogCachePort.invalidate`              | post-commit cache flush           | WIRED  | stop-list.service.ts L73 + L105                                               |
| `RedisCatalogCacheAdapter.bump`               | `nextval('menu_versions_seq')`             | `db.withoutTenant` fallback       | WIRED  | adapter.ts L89–L103 with exact reason string                                  |
| `UpsertItemService` / `UpsertCategoryService` | `transliteration.slugify`                  | slug-util.ts `deriveSlugFromName` | WIRED  | upsert-item.service.ts L24; upsert-category.service.ts L18                    |
| `upsertItem` (UPDATE path)                    | `insertSlugAlias`                          | same-tx alias insert              | WIRED  | catalog-drizzle.repository.ts L706+ + plan 07 split-path fix (commit 2345fa4) |
| `docs/api/openapi.yaml`                       | `packages/api-client/src/generated/api.ts` | openapi-typescript codegen        | WIRED  | `pnpm openapi:check` exits 0; both artefacts in sync                          |
| `.github/workflows/ci.yml`                    | `pnpm openapi:check`                       | CI step                           | WIRED  | 4 grep matches in workflow file                                               |

### Data-Flow Trace (Level 4)

| Artifact                                            | Data Variable        | Source                                                                                     | Produces Real Data | Status  |
| --------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------ | ------------------ | ------- |
| `PublishedMenu` (DTO from `/v1/menu`)               | `items[].photos[]`   | `loadPublishedMenu` reads `menu_items.photos` JSONB, presigns via S3 port                  | Yes                | FLOWING |
| `PublishedMenu`                                     | `items[].sizes[]`    | `menuItemSizes` joined per item with absolute price                                        | Yes                | FLOWING |
| `PublishedMenu`                                     | `items[]` (filtered) | `loadPublishedMenu` parallel-selects `menuStopList`, filters via `stoppedItemIds.has(...)` | Yes                | FLOWING |
| `MenuVersionPort.bump`                              | version number       | Redis INCR → on outage → `nextval('menu_versions_seq')`                                    | Yes                | FLOWING |
| `tenants.menu_first_published_at`                   | timestamp            | `finalizeMenuPublish` reads + conditionally stamps                                         | Yes                | FLOWING |
| Outbox `MenuFirstPublishedV1` / `MenuRepublishedV1` | event payload        | `appendToOutbox(buildEnvelope(...))` in same tx                                            | Yes                | FLOWING |

### Behavioral Spot-Checks

| Behavior                   | Command                                                      | Result                         | Status |
| -------------------------- | ------------------------------------------------------------ | ------------------------------ | ------ |
| Catalog unit tests pass    | `pnpm --filter @resto/api exec vitest run test/unit/catalog` | 38 tests passed across 7 files | PASS   |
| `@resto/db` typechecks     | `pnpm --filter @resto/db exec tsc --noEmit`                  | 0 errors                       | PASS   |
| `@resto/api` typechecks    | `pnpm --filter @resto/api exec tsc --noEmit`                 | 0 errors                       | PASS   |
| `@resto/events` typechecks | `pnpm --filter @resto/events exec tsc --noEmit`              | 0 errors                       | PASS   |
| OpenAPI drift gate green   | `pnpm openapi:check`                                         | "artefacts are in sync."       | PASS   |

### Probe Execution

| Probe                                                                             | Command | Result | Status  |
| --------------------------------------------------------------------------------- | ------- | ------ | ------- |
| (none declared by phase / no conventional probes in `scripts/*/tests/probe-*.sh`) | n/a     | n/a    | SKIPPED |

### Requirements Coverage

| Requirement | Source Plan            | Description                               | Status    | Evidence                                                                                                   |
| ----------- | ---------------------- | ----------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| CAT-02      | 04A-02, 04A-05         | Menu items incl. БЖУ                      | SATISFIED | `menu_items` extended (proteins/fats/carbs/kcal/nutritionEstimated); DTO + openapi + qr-menu types reflect |
| CAT-04      | 04A-04, 04A-05         | Modifier groups schema                    | SATISFIED | `menu_modifier_groups` + options with `defaultAmount`/`freeAmount`; service + endpoint live                |
| CAT-05      | 04A-04, 04A-05         | Variants/sizes schema                     | SATISFIED | `menu_item_sizes` with absolute price; service + endpoint live                                             |
| CAT-06      | 04A-03, 04A-06, 04A-07 | Publish snapshot + delayed-publish revert | SATISFIED | DelayedPublishService (5s) + POST/DELETE /publish + first-publish vs republish events                      |
| CAT-09      | 04A-01, 04A-03, 04A-05 | Zod max-length on free-text fields        | SATISFIED | dto.ts has explicit `.max(N)` everywhere; slug 120, LocalizedText 255, s3Key 1024, reason 500              |
| CAT-10      | 04A-02, 04A-06         | Redis menu-version + nextval fallback     | SATISFIED | `menu_versions_seq` sequence + `#nextvalBump` in adapter via `db.withoutTenant`                            |

No orphaned requirements: ROADMAP.md maps CAT-02/04/05/06/09/10 to phase 4a and all are claimed by at least one plan.

### Anti-Patterns Found

| File                                   | Line | Pattern | Severity | Impact                                                                                                         |
| -------------------------------------- | ---- | ------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| (none found in modified catalog files) | -    | -       | -        | No TBD/FIXME/XXX markers; no remaining `imageS3Key` field; no remaining `priceDelta` consumers in catalog code |

### Human Verification Required

(none — all must-haves verifiable programmatically; no UI surfaces in this phase per phase boundary "Backend only")

### Gaps Summary

No gaps. Phase 4a delivered every Success Criterion from ROADMAP.md and every must-have from the 7 plans. All 6 requirement IDs (CAT-02, CAT-04, CAT-05, CAT-06, CAT-09, CAT-10) closed end-to-end across DB schema → events → DTOs → services → repository → HTTP → e2e → OpenAPI.

Key architectural invariants honored:

- ADR-0020 I-1 (RLS + ScopedTx double-enforcement): All new tenant-scoped tables (`menu_stop_list`, `menu_item_slug_aliases`) have `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + iso policy (migration 0036) and go through `db.withTenant` / scoped queries in the repository.
- ADR-0020 I-2 (composite tenant FK): `pnpm db:audit-fks` exits 0 with "no I-2 violations" (per 02/03/04/06 SUMMARYs).
- ADR-0020 I-4 (`buildEnvelope` for `correlationId`): `finalizeMenuPublish` uses `buildEnvelope(MenuFirstPublishedV1, ...)` / `buildEnvelope(MenuRepublishedV1, ...)` — no direct `EventEnvelope` literals with `randomUUID()`.
- ADR-0020 I-6 (`db.withTenant` outside HTTP): `finalizeMenuPublish` probes ALS once and picks `withTenant` (HTTP path) vs `withTenantId` (setTimeout callback path) — the setTimeout callback in `DelayedPublishService` correctly drives the explicit-tenantId path.

Deferred item D-04a-deferred-01 (`tenancy_erase_tenant` references renamed tables) is fully resolved by migration 0041 — verified by enumerating the 6 DELETE statements covering all renamed + new catalog tables (`menu_item_sizes`, `menu_modifier_groups`, `menu_modifier_options`, `menu_item_modifier_groups`, `menu_stop_list`, `menu_item_slug_aliases`).

Notes for downstream phases:

- Pitfall 1 (pending publish timer lost on process restart): explicitly documented in `delayed-publish.service.ts` class-level comment; deferred to Phase 4b if observability shows it matters in production.
- Forward-shims from plans 02/04/05 (e.g. `imageS3Key` shim in repo, `slug ?? ''` placeholder in upsert services) were ALL removed in plan 06; verified by grep returning 0 for `imageS3Key` across `apps/api/src` and `packages/db/src`, and 0 for `slug: input.slug ?? ''` patterns in catalog services.

---

_Verified: 2026-05-31T09:50:00Z_
_Verifier: Claude (gsd-verifier)_
