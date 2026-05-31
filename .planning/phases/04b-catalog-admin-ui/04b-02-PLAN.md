---
phase: 04b-catalog-admin-ui
plan: 02
type: execute
wave: 1
depends_on: ["04b-01"]
files_modified:
  - packages/db/src/schema/menu.ts
  - packages/db/migrations/0042_catalog_phase4b_categories_status.sql
  - packages/db/migrations/meta/_journal.json
  - apps/api/src/contexts/catalog/application/dto.ts
  - apps/api/src/contexts/catalog/application/list-categories.service.ts
  - apps/api/src/contexts/catalog/application/list-items.service.ts
  - apps/api/src/contexts/catalog/application/get-item.service.ts
  - apps/api/src/contexts/catalog/application/list-modifier-groups.service.ts
  - apps/api/src/contexts/catalog/application/get-modifier-group.service.ts
  - apps/api/src/contexts/catalog/application/get-stop-list.service.ts
  - apps/api/src/contexts/catalog/application/get-draft-diff.service.ts
  - apps/api/src/contexts/catalog/application/archive-category.service.ts
  - apps/api/src/contexts/catalog/application/archive-item.service.ts
  - apps/api/src/contexts/catalog/domain/errors.ts
  - apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts
  - apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts
  - apps/api/src/contexts/catalog/interfaces/http/error-mapping.ts
  - apps/api/src/contexts/catalog/catalog.module.ts
  - docs/api/openapi.yaml
  - packages/api-client/src/generated/api.ts
autonomous: false
requirements: [CAT-01, CAT-02, CAT-04, CAT-05, CAT-07, CAT-08]
must_haves:
  truths:
    - "GET /internal/v1/catalog/categories returns the tenant's categories (with parentId filter) sorted by sortOrder"
    - "GET /internal/v1/catalog/items returns paginated items with optional status + categoryId filters"
    - "GET /internal/v1/catalog/items/:id returns one item with embedded sizes + modifierGroupIds"
    - "GET /internal/v1/catalog/modifier-groups returns the tenant's modifier groups with option-count and usage-count"
    - "GET /internal/v1/catalog/modifier-groups/:id returns one group with embedded options"
    - "GET /internal/v1/catalog/stop-list returns paused items with stoppedAt timestamps (for >24h stale-warning UI)"
    - "GET /internal/v1/catalog/draft-diff returns { unpublishedCount, items[] } scoped to entities awaiting publish"
    - "PATCH /internal/v1/catalog/categories/:id/archive sets status='archived' (returns 204)"
    - "PATCH /internal/v1/catalog/items/:id/archive sets status='archived' (returns 204)"
    - "menu_categories.status column exists (enum draft/published/archived, default 'draft'); existing rows backfilled to 'published'"
    - "All catalog reads + mutations go through ScopedTx (Postgres RLS double-enforcement per ADR-0020 I-1)"
    - "Hard deletes are forbidden in the database — archive uses status='archived' (D-4b-07)"
    - "All catalog mutations go through apiFetchInternal (server-only, holds INTERNAL_API_TOKEN); InternalTokenGuard remains the route guard"
    - "OpenAPI drift gate (pnpm openapi:check) is green after regen"
    - "Russian copy is canonical for all user-facing strings (D-05) — no api copy changes here, but error codes stay stable"
  artifacts:
    - path: "packages/db/migrations/0042_catalog_phase4b_categories_status.sql"
      provides: "menu_categories.status column DDL"
      contains: "ALTER TABLE menu_categories ADD COLUMN status"
    - path: "packages/db/src/schema/menu.ts"
      provides: "Drizzle status column on menuCategories"
      contains: "status: text"
    - path: "apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts"
      provides: "7 GET endpoints + 2 PATCH archive endpoints"
      contains: "@Get('categories')"
    - path: "apps/api/src/contexts/catalog/application/get-draft-diff.service.ts"
      provides: "Draft-diff query feeding the sticky publish bar"
      exports: ["GetDraftDiffService"]
  key_links:
    - from: "internal-catalog.controller.ts"
      to: "list-*.service.ts and archive-*.service.ts"
      via: "Constructor @Inject"
      pattern: "@Inject\\(.*Service\\)"
    - from: "list-*.service.ts and archive-*.service.ts"
      to: "CATALOG_REPOSITORY"
      via: "Repository port injection"
      pattern: "@Inject\\(CATALOG_REPOSITORY\\)"
    - from: "internal-catalog.controller.ts"
      to: "error-mapping.ts"
      via: "wrapWith(mapCatalogError)"
      pattern: "wrapWith\\(mapCatalogError\\)"
---

<objective>
Wave 1 backend addendum: extend `apps/api/src/contexts/catalog` with the read + archive HTTP surface that 4b admin UI needs. Add the `menu_categories.status` column via migration 0042. Add 7 GET endpoints + 2 PATCH archive endpoints to `internal-catalog.controller.ts` (D-4b-07 enumerated). Add the matching application services + Drizzle repository methods. Regenerate `docs/api/openapi.yaml` + `packages/api-client/src/generated/api.ts` and run the drift gate green. The `[BLOCKING]` schema push lives at the tail of this plan.

Purpose: Phase 4a's HTTP surface is write-only (POST upsert / DELETE stop-list / POST/DELETE publish). The admin UI cannot list, edit-load, or compute the sticky-bar diff without these reads. D-4b-07 enumerates the exact backend scope expansion.

Output: 9 new HTTP methods, 9 new application services, 1 SQL migration, 1 Drizzle schema patch, regenerated OpenAPI artifacts, drift gate green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/04b-catalog-admin-ui/04b-CONTEXT.md
@.planning/phases/04b-catalog-admin-ui/04B-RESEARCH.md
@.planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md
@.planning/phases/04a-catalog-schema-api/04A-07-SUMMARY.md
@.planning/phases/04a-catalog-schema-api/04a-VERIFICATION.md
@CLAUDE.md

<interfaces>
<!-- Existing controller shape — extend, do not rewrite. Source: apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts -->

Class-level decorators (preserve):
```typescript
@ApiTags('catalog/internal')
@Public()
@UseGuards(InternalTokenGuard)
@Controller('internal/v1/catalog')
export class InternalCatalogController
```

Existing POST shape to mirror for new endpoints:
```typescript
@Post('categories')
@HttpCode(HttpStatus.OK)
category(@Body(new RestoZodValidationPipe(UpsertCategoryInputDto)) input): Promise<IdResponseDto>
```

New GET endpoint shape:
```typescript
@Get('categories')
listCategories(@Query('parentId') parentId?: string): Promise<CategoryListResponseDto>
```

New PATCH archive shape:
```typescript
@Patch('categories/:id/archive')
@HttpCode(HttpStatus.NO_CONTENT)
archiveCategory(@Param('id') id: string): Promise<void>
```

Application service skeleton (mirror UpsertCategoryService):
```typescript
@Injectable()
export class ListCategoriesService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}
  async execute(input: { parentId: string | null }): Promise<CategoryListItemDto[]> {
    const ctx = requireTenantContext();
    // repo call inside ScopedTx — RLS double-enforcement per ADR-0020 I-1
  }
}
```

Migration analog (verbatim DDL idioms from packages/db/migrations/0029_catalog_phase4a_menu_items_extend.sql):
```sql
ALTER TABLE menu_categories ADD COLUMN status text NOT NULL DEFAULT 'draft';
--> statement-breakpoint
ALTER TABLE menu_categories ADD CONSTRAINT menu_categories_status_chk CHECK (status IN ('draft','published','archived'));
--> statement-breakpoint
UPDATE menu_categories SET status = 'published';
--> statement-breakpoint
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Schema migration 0042 (menu_categories.status) + Drizzle schema patch</name>
  <files>packages/db/migrations/0042_catalog_phase4b_categories_status.sql, packages/db/migrations/meta/_journal.json, packages/db/src/schema/menu.ts</files>
  <behavior>
    - menu_categories.status column exists post-migration with check constraint draft|published|archived
    - All existing rows backfilled to 'published' (categories that were live before this migration must remain visible)
    - Drizzle `menuCategories` schema in packages/db/src/schema/menu.ts exposes `status` matching `menuItems.status` type
    - Migration is idempotent on re-run via `IF NOT EXISTS` guards
    - tenant-isolation.spec.ts continues passing — composite-FK gymnastics not required (single-column add)
  </behavior>
  <read_first>
    - packages/db/migrations/0029_catalog_phase4a_menu_items_extend.sql (analog for ALTER TABLE + CHECK + backfill pattern — verbatim DDL idioms)
    - packages/db/migrations/0036_catalog_phase4a_new_tables_rls.sql (RLS reference if needed)
    - packages/db/src/schema/menu.ts (extend menuCategories table; mirror menuItems.status type declaration)
    - packages/db/migrations/meta/_journal.json (append idx 42 entry mirroring 0041)
    - .planning/phases/04b-catalog-admin-ui/04B-RESEARCH.md §Pitfall 6 (menu_categories has no status column)
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 1 — Migration 0042 menu_categories.status column
  </read_first>
  <action>
    Create migration `packages/db/migrations/0042_catalog_phase4b_categories_status.sql` with three statement-breakpoint-separated statements: (1) `ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';`, (2) `ALTER TABLE menu_categories ADD CONSTRAINT menu_categories_status_chk CHECK (status IN ('draft','published','archived'));` guarded by a NOT EXISTS check on `pg_constraint`, (3) `UPDATE menu_categories SET status = 'published' WHERE status = 'draft';` (backfill existing rows — they were already visible before this column existed, per D-4b-07). Add a top-of-file WHY-comment: `-- Phase 4b D-4b-07: add status to menu_categories; UI needs same badge surface as items + archive flow.`
    Patch `packages/db/src/schema/menu.ts` `menuCategories` table — add `status: text('status').notNull().default('draft'),` mirroring the existing `menuItems.status` line.
    Append the new entry to `packages/db/migrations/meta/_journal.json` mirroring the 0041 entry shape (idx 42, tag `0042_catalog_phase4b_categories_status`, breakpoints true).
    Tests: extend `packages/db/test/integration/menu-schema.spec.ts` (or add a new spec if absent under `packages/db/test/integration/`) to assert: (a) `menu_categories.status` exists with default 'draft', (b) inserting an invalid status value throws on the check constraint, (c) after migration, no existing row has status='draft' (all backfilled to 'published').
  </action>
  <verify>
    <automated>pnpm --filter @resto/db exec vitest run test/integration/menu-schema.spec.ts --no-coverage</automated>
  </verify>
  <done>
    Migration file at the exact path; journal entry appended; Drizzle schema patched; integration spec passes.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Application services + Drizzle repository methods + DTO additions for 9 new endpoints</name>
  <files>apps/api/src/contexts/catalog/application/dto.ts, apps/api/src/contexts/catalog/application/list-categories.service.ts, apps/api/src/contexts/catalog/application/list-items.service.ts, apps/api/src/contexts/catalog/application/get-item.service.ts, apps/api/src/contexts/catalog/application/list-modifier-groups.service.ts, apps/api/src/contexts/catalog/application/get-modifier-group.service.ts, apps/api/src/contexts/catalog/application/get-stop-list.service.ts, apps/api/src/contexts/catalog/application/get-draft-diff.service.ts, apps/api/src/contexts/catalog/application/archive-category.service.ts, apps/api/src/contexts/catalog/application/archive-item.service.ts, apps/api/src/contexts/catalog/domain/errors.ts, apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts, apps/api/src/contexts/catalog/catalog.module.ts</files>
  <behavior>
    - `ListCategoriesService.execute({ parentId })` returns categories filtered by parentId (null = top-level), sorted by sortOrder ASC; uses ScopedTx
    - `ListItemsService.execute({ status?, categoryId?, q?, limit, offset })` returns thin items with `{ id, name, categoryId, categoryName, parentCategoryName, photo, basePrice, status, hasSizes, stoppedAt }`; default status filter excludes 'archived'
    - `GetItemService.execute({ id })` returns one item with embedded `sizes[]` + `modifierGroupIds[]`; throws `MenuItemNotFoundError` on miss
    - `ListModifierGroupsService.execute({})` returns modifier groups with `{ id, name, minSelectable, maxSelectable, optionCount, usageCount }`
    - `GetModifierGroupService.execute({ id })` returns one group with embedded `options[]`; throws `MenuModifierGroupNotFoundError` on miss
    - `GetStopListService.execute({})` returns paused items with `{ id, name, categoryName, stoppedAt }` sorted by stoppedAt DESC (UI uses stoppedAt for >24h stale-warning)
    - `GetDraftDiffService.execute({})` returns `{ unpublishedCount: number, items: Array<{ entityType: 'item'|'category'|'modifier-group', id, name, status: 'draft'|'modified'|'archived' }> }`; modified = published AND updated_at > tenants.menu_first_published_at; capped at 100 with a `+ N more` sentinel via `truncatedCount`
    - `ArchiveCategoryService.execute(id)` sets menu_categories.status='archived'; throws `MenuCategoryNotFoundError` on miss; idempotent on already-archived
    - `ArchiveItemService.execute(id)` sets menu_items.status='archived'; throws `MenuItemNotFoundError` on miss; idempotent on already-archived
    - Every service calls `requireTenantContext()` + uses `ScopedTx` (no raw tx access)
  </behavior>
  <read_first>
    - apps/api/src/contexts/catalog/application/get-published-menu.service.ts (analog for list services — RLS-scoped reads)
    - apps/api/src/contexts/catalog/application/get-menu-item.service.ts (analog for get-item / get-modifier-group services)
    - apps/api/src/contexts/catalog/application/stop-list.service.ts (analog for get-stop-list — read-side)
    - apps/api/src/contexts/catalog/application/upsert-category.service.ts (analog for archive-category — status mutation pattern)
    - apps/api/src/contexts/catalog/application/upsert-item.service.ts (analog for archive-item)
    - apps/api/src/contexts/catalog/application/dto.ts (extend with new list/detail DTOs — mirror existing UpsertItemInputSchema shape)
    - apps/api/src/contexts/catalog/domain/errors.ts (extend CatalogDomainError union)
    - apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts (add list / get / archive methods on the CatalogRepository class)
    - apps/api/src/contexts/catalog/catalog.module.ts (register new services in providers array)
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 1 — Application services (list/get/archive) + Pattern S5 + Pattern S6
    - .planning/phases/04b-catalog-admin-ui/04B-RESEARCH.md §Open Questions #2 (Modified badge computation) #3 (items list shape) #4 (stoppedAt exposure) #5 (draft-diff scope)
    - packages/db/src/client.ts (ScopedTx contract — withTenant pattern)
  </read_first>
  <action>
    Add Zod DTO schemas to `apps/api/src/contexts/catalog/application/dto.ts` per the behavior list. Naming: `CategoryListItemSchema` + `CategoryListResponseSchema` (array); `ItemListItemSchema` + `ItemListResponseSchema` (with pagination meta `{ total, limit, offset }`); `ItemDetailResponseSchema` extending `UpsertItemInputSchema` with `id`, `sizes`, `modifierGroupIds`; `ModifierGroupListItemSchema` + `ModifierGroupListResponseSchema`; `ModifierGroupDetailResponseSchema` (group + options); `StopListItemSchema` + `StopListResponseSchema` (includes `stoppedAt: z.string().datetime()`); `DraftDiffResponseSchema` ({ unpublishedCount, items, truncatedCount }). Class wrappers via `createZodDto(...)` named `CategoryListResponseDto` etc. for nestjs-zod / swagger emission. Mirror CAT-09 max-length constraints from existing schemas.
    Add 3 new error classes to `apps/api/src/contexts/catalog/domain/errors.ts`: `MenuCategoryAlreadyArchivedError`, `MenuItemAlreadyArchivedError` (both extend `CatalogDomainError` with `readonly kind` literal per Pattern S2 — NOTE: services treat re-archive as idempotent no-op per behavior spec, so these may not be thrown; declare anyway for future use). `MenuCategoryNotFoundError` should already exist; if not, add it.
    Add 9 application services per files_modified — one file each. Each is `@Injectable()`, depends on `CATALOG_REPOSITORY` symbol token, calls `requireTenantContext()` first. For list services, accept the filter input as one parameter object. For archive services, accept just the `id` string.
    Extend `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` with corresponding repo methods: `listCategoriesByParent(parentId)`, `listItems({ status?, categoryId?, q?, limit, offset })`, `getItemById(id)` (with sizes + modifierGroupIds joined), `listModifierGroups()` (with count subqueries), `getModifierGroupById(id)` (with options), `listStopListWithStoppedAt()`, `computeDraftDiff()` (modified detection per Open Question #2 — `status='published' AND updated_at > tenants.menu_first_published_at`), `archiveCategory(id)`, `archiveItem(id)`. Every query goes through `db.withTenant(tenantId, async (_tx, scoped) => scoped.selectFrom(...))` — NO raw tx access. Cap draft-diff result at 100 rows; emit `truncatedCount = totalCount - 100` if exceeded.
    Register all 9 services in `apps/api/src/contexts/catalog/catalog.module.ts` `providers` array. Order: list services before archive services before existing services for readability.
    Tests: extend `apps/api/test/e2e/catalog.e2e.spec.ts` (or add a new spec under `apps/api/test/e2e/catalog-reads.e2e.spec.ts`) with the following assertions: (a) GET /categories returns sorted by sortOrder for the seeded tenant; (b) GET /items?status=draft filters; (c) GET /items/:id includes sizes + modifierGroupIds; (d) GET /modifier-groups includes optionCount/usageCount; (e) GET /modifier-groups/:id includes options; (f) GET /stop-list includes stoppedAt; (g) GET /draft-diff returns unpublishedCount + capped items; (h) PATCH /categories/:id/archive flips status to 'archived' and returns 204; (i) PATCH /items/:id/archive does the same; (j) tenant-isolation: requests with mismatched x-tenant-id return 0 results / 404 for cross-tenant ids.
  </action>
  <verify>
    <automated>pnpm --filter @resto/api exec vitest run test/e2e/catalog-reads.e2e.spec.ts test/e2e/catalog.e2e.spec.ts --no-coverage</automated>
  </verify>
  <done>
    9 application services exist with required `.execute()` signatures; repository extended; DTOs added; module registered; e2e specs pass for all 9 new endpoints + cross-tenant isolation.
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire 9 HTTP endpoints onto internal-catalog.controller.ts + error mapping + OpenAPI regen + drift gate</name>
  <files>apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts, apps/api/src/contexts/catalog/interfaces/http/error-mapping.ts, docs/api/openapi.yaml, packages/api-client/src/generated/api.ts</files>
  <read_first>
    - apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts (extend — preserve class-level decorators per Pattern S3)
    - apps/api/src/contexts/catalog/interfaces/http/error-mapping.ts (extend with new domain error mappings)
    - tools/openapi-check.ts (drift gate logic)
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 1 — Backend GET endpoints + Pattern S3 (wrapWith) + Pattern S4 (RestoZodValidationPipe) + Pattern S7 (OpenAPI regen)
    - .planning/phases/04a-catalog-schema-api/04A-07-SUMMARY.md §HTTP endpoints + error mapping (existing surface to extend)
  </read_first>
  <action>
    Add `Get, Patch, Query` to the `@nestjs/common` import on line 1. Constructor: inject the 9 new application services from Task 2 alongside the existing 7. Add 9 new methods on `InternalCatalogController` mirroring the existing POST shape (Pattern S3/S4):
    - `@Get('categories') listCategories(@Query('parentId') parentId?: string): Promise<CategoryListResponseDto>` — `return wrap(() => this.listCategoriesService.execute({ parentId: parentId ?? null }));`
    - `@Get('items') listItems(@Query('status') status?, @Query('categoryId') categoryId?, @Query('q') q?, @Query('limit') limit?, @Query('offset') offset?): Promise<ItemListResponseDto>` — call `listItemsService.execute({...})` with defaults `limit=50, offset=0`
    - `@Get('items/:id') getItem(@Param('id') id: string): Promise<ItemDetailResponseDto>`
    - `@Get('modifier-groups') listModifierGroups(): Promise<ModifierGroupListResponseDto>`
    - `@Get('modifier-groups/:id') getModifierGroup(@Param('id') id: string): Promise<ModifierGroupDetailResponseDto>`
    - `@Get('stop-list') listStopList(): Promise<StopListResponseDto>`
    - `@Get('draft-diff') getDraftDiff(): Promise<DraftDiffResponseDto>`
    - `@Patch('categories/:id/archive') @HttpCode(HttpStatus.NO_CONTENT) archiveCategory(@Param('id') id: string): Promise<void>` — `return wrap(() => this.archiveCategoryService.execute(id));`
    - `@Patch('items/:id/archive') @HttpCode(HttpStatus.NO_CONTENT) archiveItem(@Param('id') id: string): Promise<void>`
    Every endpoint carries `@HttpCode(HttpStatus.OK)` (or NO_CONTENT for PATCH archive), `@ApiOkResponse({ type: <DTO> })`, `@ApiUnauthorizedResponse({ type: ProblemDetailsDto })`. Wrap every implementation in `wrap(() => ...)` per Pattern S3. Class-level decorators stay unchanged.
    Extend `error-mapping.ts` with `case 'MenuCategoryAlreadyArchivedError': return new ConflictException({ code: 'catalog.menu_category_already_archived', message: err.message });` (and item variant). If the upstream services are idempotent for re-archive, these cases are defensive only — keep them in the mapping for completeness.
    Run `pnpm openapi:check` from repo root to regenerate `docs/api/openapi.yaml` + `packages/api-client/src/generated/api.ts`. Commit the regenerated files. The drift gate (existing in `tools/openapi-check.ts` + CI workflow per Pattern S7) must exit 0.
    Add a unit spec under `apps/api/test/unit/catalog/error-mapping.spec.ts` (extend existing) asserting the two new error codes map to 409 ConflictException with the documented codes.
  </action>
  <verify>
    <automated>pnpm --filter @resto/api exec vitest run test/unit/catalog/error-mapping.spec.ts --no-coverage && pnpm openapi:check</automated>
  </verify>
  <done>
    All 9 endpoints present on InternalCatalogController with documented decorators; error mapping covers new codes; OpenAPI artifacts regenerated; drift gate green.
  </done>
</task>

<task type="auto">
  <name>Task 4 [BLOCKING]: Apply schema migration 0042 to dev database</name>
  <files>(database state change only — no source file modification)</files>
  <read_first>
    - packages/db/src/cli/migrate.ts (migration runner — invoked by `pnpm --filter @resto/db db:migrate`)
    - packages/db/migrations/0042_catalog_phase4b_categories_status.sql (the migration to apply — created in Task 1)
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Key architectural callouts #5 (migration must run before frontend references the column)
  </read_first>
  <action>
    Ensure the dev Docker stack is up (`pnpm dev:up` if necessary — Postgres container required). Run `pnpm --filter @resto/db db:migrate` from repo root to apply migration 0042 to the dev database. Verify the new column exists by running `pnpm --filter @resto/db exec psql -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='menu_categories' AND column_name='status';"` (or equivalent). Re-run the migrate command once more — it must be a no-op (already applied). Do NOT use `drizzle-kit push` — this repo uses the hand-written migration runner (`packages/db/src/cli/migrate.ts`) per the schema-push requirement.
    This task is BLOCKING because the migration file presence is necessary but not sufficient — type checks and builds pass against the Drizzle schema (compile-time), but runtime queries on `menu_categories.status` fail unless the live database has the column. Frontend Wave 3+ depends on `GET /categories` returning the status field, which requires the live column.
  </action>
  <verify>
    <automated>pnpm --filter @resto/db exec psql -c "SELECT column_name FROM information_schema.columns WHERE table_name='menu_categories' AND column_name='status'" | grep -q status</automated>
  </verify>
  <done>
    Migration 0042 applied to dev Postgres; column exists; re-running db:migrate is a no-op.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Admin server actions → api `/internal/v1/catalog/*` | INTERNAL_API_TOKEN bearer; InternalTokenGuard enforces |
| api application services → Postgres | ScopedTx + RLS double-enforcement per ADR-0020 I-1 |
| Public `/v1/menu` (unchanged in 4b) → published catalog only | RLS isolates tenants |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04b-02-01 | Information Disclosure | Cross-tenant data leak via new GET endpoints | mitigate | Every list/get service calls `requireTenantContext()` + `db.withTenant(tenantId, ...)`; Postgres RLS double-enforces; Task 2 e2e spec asserts cross-tenant requests return 0 results / 404 |
| T-04b-02-02 | Tampering | Hard-delete bypassing audit trail | mitigate | Archive services set `status='archived'` — no DELETE on menu_categories or menu_items; `resto_app` role lacks DELETE on these tables (existing) |
| T-04b-02-03 | Elevation of Privilege | Unauthorized archive via missing guard | mitigate | New PATCH endpoints inherit class-level `@UseGuards(InternalTokenGuard)` — same gate as POST endpoints |
| T-04b-02-04 | DoS | draft-diff query O(N) on 500-item tenant | mitigate | Cap result at 100 rows + truncatedCount sentinel; query uses existing `menu_items_tenant_status_sort_idx` index; Pitfall #8 in RESEARCH.md |
| T-04b-02-05 | Tampering | Drift between OpenAPI artifact and live controller | mitigate | `pnpm openapi:check` re-runs after every controller change; CI workflow gate enforces (Pattern S7) |
| T-04b-02-06 | DoS | Auto-save flood from admin (Wave 3+) hitting POST /items | mitigate | Existing app-level rate-limit per 4a T-04a-07-05 covers this; 1.5s client debounce reduces load |
</threat_model>

<verification>
- Migration 0042 applies cleanly on a fresh dev database; backfill leaves no row with status='draft'
- All 9 new endpoints respond per acceptance criteria in Task 2
- `pnpm openapi:check` exits 0
- `grep -c '@Get\|@Patch' apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts` returns >= 9
- Tenant-isolation e2e spec covers the 5 new readable entities (categories, items, modifier-groups, stop-list, draft-diff)
- `docs/api/openapi.yaml` contains operationId strings for the 9 new endpoints
</verification>

<success_criteria>
1. menu_categories.status column exists with check constraint draft|published|archived
2. 9 new HTTP methods present on InternalCatalogController with correct decorators
3. 9 new application services exist and pass behavior spec
4. CatalogRepository extended with corresponding query methods; all use ScopedTx
5. OpenAPI artifacts regenerated; drift gate green
6. Migration applied to dev database (Task 4 blocking)
7. Cross-tenant e2e isolation passes for all new endpoints
</success_criteria>

<output>
Create `.planning/phases/04b-catalog-admin-ui/04b-02-SUMMARY.md` when done.
</output>
