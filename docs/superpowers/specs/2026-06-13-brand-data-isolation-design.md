# Design: Brand data isolation (Phase 1 of multibrand block)

**Date:** 2026-06-13
**Source:** `.planning/AUDIT.md` findings #2 (HIGH) + #3 (HIGH)
**Status:** Approved — ready for implementation plan
**Part of:** multibrand isolation block. **Phase 1 = data isolation (this doc).** Phase 2 = per-operator brand authorization (#15), separate spec/plan.

## Problem

Within one tenant, a menu entity belonging to brand A can be corrupted from a brand-B editing context:

- **#2** — catalog mutations (`upsertItem` update branch, `archiveItem`, `archiveCategory`, `reorderCategories`, `removeFromStopList`, `upsertItemSize`, `upsertModifierGroup`, `upsertModifierOption`) target rows by `(id, tenant_id)` only. An operator whose active brand is A can update/archive a brand-B row by sending its id. The upsert update branch can even re-stamp `brand_id` to A, hijacking the row.
- **#3** — menu slug uniqueness is tenant-wide (`menu_categories_tenant_slug_uq`, `menu_items_tenant_slug_uq` on `(tenant_id, slug)`). `ON CONFLICT (tenant_id, slug) DO UPDATE` means brand B creating a slug already used by brand A **overwrites brand A's row** and flips its `brand_id` — silent data loss, no error.

Decided scope (via brainstorming): multibrand is a live MVP-1 scenario; **every menu entity belongs to exactly one brand** (`brand_id NOT NULL`, no tenant-shared entities).

## Key facts (verified against current code)

- All menu tables have `brand_id uuid` **nullable** (`packages/db/src/schema/menu.ts`): `menu_categories`, `menu_items`, `menu_item_sizes`, `menu_modifier_groups`, `menu_modifier_options`, `menu_item_modifier_groups`.
- The write path **already stamps the active brand** on some creates — `upsert-item`, `upsert-modifier-group`, `upsert-modifier-option`, `stop-list` services do `brandId = getBrandId() ?? null`. **`upsert-category` and `upsert-item-size` do NOT set brandId today** — they must be brought in line.
- Slug uniqueness exists only on `menu_categories` (`:54`) and `menu_items` (`:117`); modifier groups/options/sizes have no slug-uniqueness.
- ALS exposes `getBrandId()` / `requireBrandId()` / `withBrand()` (`packages/db/src/context.ts`); `TenantContextMiddleware` binds `brandId` from `x-brand-slug` (tenant-verified, RES-173).
- Mutations now run through the authenticated `/v1/catalog` controller (AUDIT #1, merged) — the operator + active brand are present.

## Approach

Enforce brand ownership at the **application/repository layer** (the `ScopedTx` fence), mirroring how tenant isolation already works. Make `brand_id NOT NULL` so the invariant is structural and the predicates need no NULL handling.

DB-level brand RLS is **out of scope**: RLS only knows the tenant (GUC `app.current_tenant`); there is no `app.current_brand` GUC. App-layer predicates are the fix; a brand GUC + RLS is a possible future hardening (noted, not built).

## Components

### 1. Migration — `brand_id NOT NULL` + brand-scoped uniqueness

`packages/db/migrations/` (new hand-written migration) + `packages/db/src/schema/menu.ts`:

- **Backfill** every `brand_id IS NULL` row on each menu table:
  `UPDATE menu_x SET brand_id = (SELECT b.id FROM brands b WHERE b.tenant_id = menu_x.tenant_id ORDER BY b.created_at LIMIT 1) WHERE brand_id IS NULL`.
  If any row's tenant has no brand, the subquery is NULL and the subsequent `SET NOT NULL` fails loudly — acceptable (pre-revenue; indicates corrupt seed data to fix).
- `ALTER COLUMN brand_id SET NOT NULL` on all six tables; mirror `.notNull()` in the Drizzle schema.
- Replace the two slug unique indexes: drop `menu_categories_tenant_slug_uq` / `menu_items_tenant_slug_uq`, create `(tenant_id, brand_id, slug)` equivalents. Update the `uniqueIndex(...)` definitions in `menu.ts`.

### 2. Service layer — writes require an active brand

`apps/api/src/contexts/catalog/application/*.service.ts`:

- Switch `getBrandId() ?? null` → **`requireBrandId()`** in every write service (`upsert-item`, `upsert-modifier-group`, `upsert-modifier-option`, `stop-list`).
- Add `brandId = requireBrandId()` to the write services that don't set it yet (`upsert-category`, `upsert-item-size`) and thread it to the repo.
- Read services (`get-published-menu`) keep `getBrandId() ?? null` — reads are out of scope.

### 3. Repository — brand-ownership predicate (#2) + ON CONFLICT (#3)

`apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts`:

- Every update/archive/delete-by-id path adds `eq(table.brandId, brandId)` to its `WHERE` (alongside the existing tenant scope): `upsertItem` update branch, `upsertCategory`, `archiveItem`, `archiveCategory`, `reorderCategories`, `removeFromStopList`, `upsertItemSize`, `upsertModifierGroup`, `upsertModifierOption`. The active `brandId` is passed in from the service.
- A brand mismatch yields zero matched rows → surface the existing not-found domain error (`MenuItemNotFoundError` / `MenuCategoryNotFoundError` / etc.) — **no silent insert, no overwrite**.
- Change `onConflictDoUpdate` targets from `[tenantId, slug]` → `[tenantId, brandId, slug]` for items and categories.
- Child entities (`item-sizes`, `menu_item_modifier_groups` join) set `brand_id` = active brand on insert (equals the parent's brand, since editing happens within the brand context).

### 4. Error handling

Reuse existing domain errors + `catalog/interfaces/http/error-mapping.ts`. Cross-brand target = not-found (404), per approved UX (an operator simply doesn't see another brand's row).

## Data flow (brand-scoped mutation)

1. Admin server action calls `apiFetch('/v1/catalog/items', POST, ...)` with the active-brand cookie → `x-brand-slug`.
2. `TenantContextMiddleware` binds `tenantId` + `brandId` (resolved + tenant-verified) into ALS.
3. `CatalogController` → service → `requireBrandId()` (throws if no active brand).
4. Repo upserts/updates with `WHERE tenant_id = … AND brand_id = activeBrand AND id = …`; `ON CONFLICT (tenant_id, brand_id, slug)`.
5. Brand-B row by id → 0 rows matched → not-found error.

## Testing

- **e2e** (`catalog-brand-isolation.e2e.spec.ts`, new): one tenant, two brands A and B (created via the authed brand-create flow), each with its own active-brand context. Assert:
  - Operator on brand A → 404 updating a brand-B item by id; → 404 archiving a brand-B category by id.
  - Brand A and brand B can both hold slug `burger`; creating `burger` under B does **not** mutate A's item (A's row intact, distinct id, B gets a new row).
- **Migration / integration test** (testcontainer): seed null-brand rows → run migration → assert backfilled to the tenant's brand, `NOT NULL` holds, the new `(tenant_id, brand_id, slug)` index rejects intra-brand dupes and allows cross-brand same-slug.
- Update existing catalog e2e/unit where a write now requires an active brand.

## Integration check

Admin must always have an active brand when editing the menu (else `requireBrandId()` → 400/403). Verify the brand switcher / menu route guarantees a selected brand; if a path can reach menu editing with no active brand, add a small admin guard. (Likely already true — the menu section is brand-scoped.)

## Out of scope (do not touch)

- Per-operator brand authorization — `@RequireBrand`, `BrandScopeGuard` activation, `member_brand_scope` population (#15 = Phase 2).
- Catalog read-path brand filtering (#7/#8/#9), composite FK on `brand_id` (#13), DB-level brand RLS.

## Definition of done

- All six menu tables: `brand_id NOT NULL`; slug uniqueness is `(tenant_id, brand_id, slug)`.
- Every catalog write requires an active brand and scopes update/archive/delete by `brand_id`; cross-brand by-id access returns not-found.
- Cross-brand slug collision no longer overwrites; both brands keep independent rows.
- New e2e proves cross-brand write isolation + slug independence; migration test proves backfill + NOT NULL + new index.
- typecheck, lint, catalog e2e, `openapi:check` green. No code comments.
