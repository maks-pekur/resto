---
phase: 04a-catalog-schema-api
plan: 06
type: execute
wave: 6
depends_on: ['04A-05']
files_modified:
  - apps/api/src/contexts/catalog/domain/ports.ts
  - apps/api/src/contexts/catalog/domain/published-menu.ts
  - apps/api/src/contexts/catalog/application/delayed-publish.service.ts
  - apps/api/src/contexts/catalog/application/publish-menu.service.ts
  - apps/api/src/contexts/catalog/application/upsert-category.service.ts
  - apps/api/src/contexts/catalog/application/upsert-item.service.ts
  - apps/api/src/contexts/catalog/application/upsert-modifier-group.service.ts
  - apps/api/src/contexts/catalog/application/upsert-modifier-option.service.ts
  - apps/api/src/contexts/catalog/application/upsert-item-size.service.ts
  - apps/api/src/contexts/catalog/application/stop-list.service.ts
  - apps/api/src/contexts/catalog/application/get-published-menu.service.ts
  - apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts
  - apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts
  - apps/api/src/contexts/catalog/catalog.module.ts
autonomous: true
requirements:
  - CAT-06
  - CAT-10
tags:
  [
    catalog,
    services,
    repository,
    delayed-publish,
    redis-fallback,
    slug-auto-derive,
  ]
goal: Refactor the catalog application + infrastructure layers — repository to use renamed tables (sizes/modifier groups/options/junction), photos JSONB, BJU read; new services for modifier groups, modifier options, item sizes, stop-list; DelayedPublishService (5s in-memory timer per tenant); PublishMenuService with first-publish detection + outbox emission; UpsertCategory/Item services with slug auto-derive + alias creation; MenuVersionPort with Postgres `nextval` fallback (CAT-10); CatalogCachePort.invalidate() method; stop-list overlay in loadPublishedMenu.

must_haves:
  truths:
    - '`DelayedPublishService` schedules per-tenant 5s timers; double-click cancels and reschedules; `cancel()` returns true if undo was in time, false if already published; `OnModuleDestroy` clears all pending timers.'
    - '`PublishMenuService.doPublish(tenantId)` (called from DelayedPublishService.setTimeout callback) uses `db.withTenant(tenantId, ...)` per ADR-0020 I-6 (NOT `requireTenantContext`); reads `tenants.menu_first_published_at`; emits `MenuFirstPublishedV1` if null else `MenuRepublishedV1`; updates `menu_first_published_at` to NOW() on first publish; uses `buildEnvelope` (ADR-0020 I-4); calls `appendToOutbox` within the same transaction.'
    - '`UpsertItemService` + `UpsertCategoryService` auto-derive `slug` from name via `transliteration.slugify` when slug is absent; on slug change for an existing item, insert an `item_slug_aliases` row (idempotent via `onConflictDoNothing`).'
    - '`UpsertModifierGroupService`, `UpsertModifierOptionService`, `UpsertItemSizeService` each implement single `execute(input)` per established service shape; depend on `CATALOG_REPOSITORY` port.'
    - '`StopListService` (a) inserts/deletes rows in `menu_stop_list` via ScopedTx; (b) emits `ItemStoppedV1` / `ItemUnstoppedV1` via `appendToOutbox` in same transaction; (c) calls `CatalogCachePort.invalidate(tenantId, currentVersion)` after write (Option B per RESEARCH.md Pattern 2).'
    - '`CatalogDrizzleRepository.loadPublishedMenu` performs three parallel ScopedTx selects (categories, items, stop-list) and filters items by `!stoppedItemIds.has(r.id)` before the photo-sign/modifier-group join; presigns ALL entries in `r.photos[]` via new `signPhotos` helper; renames `variants` → `sizes` in mapping with absolute `price`.'
    - '`CatalogRepository` port has new methods: `upsertModifierGroup`, `upsertModifierOption`, `upsertItemSize`, `addToStopList`, `removeFromStopList`, `getMenuFirstPublishedAt(tenantId)`, `insertSlugAlias(tenantId, itemId, alias)`; `CatalogCachePort` has new method `invalidate(tenantId, version, brandId?)`.'
    - "`RedisCatalogCacheAdapter.bump()` falls back to `nextval('menu_versions_seq')` via `db.withoutTenant('menu version nextval fallback — Redis unavailable', ...)` on Redis error (CAT-10 / D-4a-07); new `invalidate(tenantId, version, brandId?)` method deletes the Redis key for that version."
    - '`PublishedMenuItem` domain read-model has `photos: readonly PublishedMenuItemPhoto[]`, BJU fields (proteins/fats/carbs/kcal/nutritionEstimated), `sizes` (renamed from variants — each with absolute price), `modifierGroupIds`; `imageUrl: string | null` is retained as backward-compat convenience (presigned URL of photos[0]).'
    - '`catalog.module.ts` providers list includes all new services (DelayedPublishService, UpsertModifierGroupService, UpsertModifierOptionService, UpsertItemSizeService, StopListService); `TenantAwareDb` is injected into `RedisCatalogCacheAdapter` for the nextval fallback path.'
  artifacts:
    - path: 'apps/api/src/contexts/catalog/application/delayed-publish.service.ts'
      provides: '5s in-memory per-tenant timer for delayed-publish revert'
      contains: 'OnModuleDestroy'
    - path: 'apps/api/src/contexts/catalog/application/publish-menu.service.ts'
      provides: 'doPublish() with first-publish detection + outbox emission'
      contains: 'MenuFirstPublishedV1'
    - path: 'apps/api/src/contexts/catalog/application/stop-list.service.ts'
      provides: 'Stop-list add/remove + outbox events + cache invalidate'
      contains: 'ItemStoppedV1'
    - path: 'apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts'
      provides: 'Refactored repository against new table names + photos + stop-list overlay'
      contains: 'signPhotos'
    - path: 'apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts'
      provides: 'nextval fallback + invalidate method'
      contains: 'menu_versions_seq'
  key_links:
    - from: 'DelayedPublishService.setTimeout callback'
      to: 'PublishMenuService.doPublish'
      via: 'schedule -> 5s timer -> doPublish(tenantId)'
      pattern: "doPublish\\("
    - from: 'StopListService write path'
      to: 'CatalogCachePort.invalidate'
      via: 'after transaction commit'
      pattern: "cachePort\\.invalidate"
    - from: 'RedisCatalogCacheAdapter.bump catch block'
      to: "nextval('menu_versions_seq')"
      via: 'db.withoutTenant fallback'
      pattern: 'menu_versions_seq'
---

<objective>
Refactor the catalog application + infrastructure layers to match the iiko-aligned schema (plans 02–04) and the type contracts (plan 05). This is the largest plan in 4a and the heart of the phase — it lands the delayed-publish revert mechanism (D-4a-05 + CAT-06), the first-publish vs republish distinction (D-4a-06), the Redis-nextval fallback (D-4a-07 + CAT-10), the stop-list read-overlay (D-4a-10 per researcher), the slug auto-derive with alias creation (D-4a-04), and the cascading rename of repository code from `variants/modifiers` to `sizes/modifier_groups`.

After this plan, `pnpm --filter @resto/api typecheck` will be green again. Plan 07 then wires controllers + e2e tests + openapi regen + downstream consumers.

Purpose: Land the runtime behavior of all 6 phase requirement IDs. CAT-06 (publish snapshot logic incl. delayed-publish revert) and CAT-10 (Redis menu-version + nextval fallback) are the requirement IDs CLOSED here; CAT-02, CAT-04, CAT-05, CAT-09 are advanced (types already in plan 05; this plan wires services against those types).
Output: 14 files modified; `pnpm --filter @resto/api typecheck` green; existing catalog spec tests still pass (with refactored expectations); module wiring complete.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/04a-catalog-schema-api/04a-CONTEXT.md
@.planning/phases/04a-catalog-schema-api/04A-RESEARCH.md
@.planning/phases/04a-catalog-schema-api/04A-PATTERNS.md
@apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts
@apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts
@apps/api/src/contexts/catalog/application/publish-menu.service.ts
@apps/api/src/contexts/catalog/application/upsert-modifier.service.ts
@apps/api/src/contexts/catalog/domain/ports.ts
@apps/api/src/contexts/catalog/domain/published-menu.ts
@apps/api/src/contexts/catalog/catalog.module.ts
@packages/db/src/client.ts

<interfaces>
**DelayedPublishService shape (per PATTERNS.md §delayed-publish.service.ts + RESEARCH.md §Pattern 1):**
- Class implements `OnModuleDestroy` (NestJS lifecycle).
- Private `#pending = new Map<string, { timerId: NodeJS.Timeout }>()`.
- Constant `#DELAY_MS = 5_000`.
- `async schedule(tenantId: string): Promise<{ cancel: () => boolean }>` — cancels any existing timer for this tenant, sets a new 5s timer that calls `this.publisher.doPublish(tenantId)`; returns a `cancel` function valid for the 5s window that returns `true` if the timer was still pending, `false` if already executed.
- `onModuleDestroy()` — iterates `#pending`, clears all timers, empties map.
- Pitfall 7 (RESEARCH.md): `setTimeout` callback escapes the ALS frame, so MUST use `db.withTenant(tenantId, ...)` not `requireTenantContext()` — the publisher service handles this.

**PublishMenuService.doPublish(tenantId) shape (per PATTERNS.md + RESEARCH.md §Pattern 3):**

- Public method `async doPublish(tenantId: string): Promise<{ version: number }>`.
- Wraps body in `await this.db.withTenant(async (tx, _scoped) => { ... }, tenantId)` (per ADR-0020 I-6 — tenantId is passed as second arg since we're outside HTTP middleware).
- Inside transaction:
  1. `const version = await this.versions.bump(tenantId)`.
  2. `const firstPublishedAt = await this.tenantRepo.getMenuFirstPublishedAt(tenantId)` — returns `Date | null`.
  3. If `firstPublishedAt === null`: update `tenants.menu_first_published_at = NOW()` for this tenant; `await appendToOutbox(tx, { envelope: buildEnvelope(MenuFirstPublishedV1, { tenantId, version }) })`.
  4. Else: `await appendToOutbox(tx, { envelope: buildEnvelope(MenuRepublishedV1, { tenantId, version }) })`.
- Returns `{ version }`.

Existing `PublishMenuService.execute()` (verified 20-line file) currently bumps version only. After refactor, keep `execute()` as a thin wrapper that delegates to `DelayedPublishService.schedule()` from the HTTP middleware path (the controller calls schedule), OR delete `execute()` and let the controller call `DelayedPublishService` directly. Per RESEARCH.md flow diagram: controller calls `DelayedPublishService.schedule()`; after 5s timer fires, the service calls `PublishMenuService.doPublish(tenantId)` directly. Choose the second path — `execute()` no longer makes sense semantically.

**StopListService shape (per PATTERNS.md §stop-list.service.ts):**

- Two methods: `async stop(input: StopItemInput): Promise<{ id: string }>` and `async unstop(itemId: string): Promise<void>`.
- Each wraps body in `db.withTenant(...)` (within HTTP middleware — `requireTenantContext()` works; setTimeout escapes only matter for delayed-publish).
- Pattern: insert into `menu_stop_list` with `onConflictDoNothing` for `stop`, delete by `(tenant_id, item_id)` match for `unstop`.
- Emit `ItemStoppedV1` / `ItemUnstoppedV1` via `appendToOutbox` in same tx.
- AFTER transaction commits, call `cachePort.invalidate(tenantId, currentVersion, brandId)` (Option B per RESEARCH.md Pattern 2).

**Slug auto-derive (per RESEARCH.md §Pattern 4):**

- `import { slugify } from 'transliteration'` (installed in plan 01).
- Helper `normalizeSlug(input: string): string` chains `slugify({ lowercase, separator: '-', trim })` + `.replace(/[^a-z0-9-]/g, '')` + `.replace(/-+/g, '-')` + `.replace(/^-|-$/g, '')`.
- In `UpsertItemService.execute(input)`: if `input.slug` is absent, derive `derivedSlug = normalizeSlug(input.name[defaultLocale] ?? '')` (use the LocalizedText default locale — see `@resto/domain` for the convention).
- On UPDATE path: if existing item.slug !== newSlug, insert an alias row in `menu_item_slug_aliases` with `(itemId, tenantId, alias=oldSlug)` via `onConflictDoNothing`.

**Repository renames + extensions (per PATTERNS.md §catalog-drizzle.repository.ts):**

- find / replace:
  - `schema.menuVariants` → `schema.menuItemSizes`
  - `schema.menuModifiers` → `schema.menuModifierGroups`
  - `schema.menuItemModifiers` → `schema.menuItemModifierGroups`
  - `r.imageS3Key` → `r.photos` (now an array)
  - `m.modifierId` → `m.modifierGroupId`
  - `v.priceDelta` → `v.price` (absolute — DO NOT add to base price)
- New helper `signPhotos(photos: MenuItemPhoto[]): Promise<SignedPhoto[]>` — `Promise.all(photos.map(async p => ({ ...p, url: await this.imageUrl.presignGet(p.s3Key, IMAGE_URL_TTL_SECONDS) })))`. `imageUrl` of `PublishedMenuItem` = `signedPhotos[0]?.url ?? null` (backward-compat convenience).
- Stop-list overlay in `loadPublishedMenu`: `const [categoriesRows, itemsRows, stopListRows] = await Promise.all([scoped.selectFrom(schema.menuCategories, ...), scoped.selectFrom(schema.menuItems, ...), scoped.selectFrom(schema.menuStopList)])`. `const stoppedItemIds = new Set(stopListRows.map(r => r.itemId))`. Filter `itemsRows.filter(r => !stoppedItemIds.has(r.id))` before the modifier-group / size joins.
- BJU fields propagate from `menu_items` row to `PublishedMenuItem` — read `proteins, fats, carbs, kcal, nutritionEstimated` from row, pass through as `string | null` (decimals serialise as string via Drizzle `numeric`) / `number | null` / `boolean`.

**New repository port methods (per PATTERNS.md §domain/ports.ts):**

- `upsertModifierGroup(input: UpsertModifierGroupRow): Promise<{ id: string }>`
- `upsertModifierOption(input: UpsertModifierOptionRow): Promise<{ id: string }>`
- `upsertItemSize(input: UpsertItemSizeRow): Promise<{ id: string }>`
- `addToStopList(input: { itemId: string, tenantId: string, brandId?: string | null, reason: string | null, stoppedByUserId: string | null }): Promise<{ id: string }>`
- `removeFromStopList(input: { itemId: string, tenantId: string }): Promise<{ removed: boolean }>`
- `getMenuFirstPublishedAt(tenantId: string): Promise<Date | null>`
- `insertSlugAlias(input: { itemId: string, tenantId: string, alias: string }): Promise<void>`

**MenuVersionPort.bump nextval fallback (per RESEARCH.md §Code Examples — MenuVersionPort):**

- Existing `bump(tenantId): Promise<number>` falls back to `Date.now()` on Redis error (lines 65-73 of redis-catalog-cache.adapter.ts).
- New behavior: replace the `Date.now()` fallback with `nextval('menu_versions_seq')`:
  - In catch: `await this.db.withoutTenant('menu version nextval fallback — Redis unavailable', async (tx) => tx.execute(sql\`SELECT nextval('menu_versions_seq') AS v\`))`and return`Number(result.rows[0].v)`.
- Constructor must accept `@Inject(TenantAwareDb) private readonly db: TenantAwareDb` in addition to existing `Env` inject.
- Add `invalidate(tenantId, version, brandId?)` method that calls `client.del(MENU_KEY(tenantId, version, brandId ?? null))`; no-ops if `client === null`; catches errors and warns.

**`db.withTenant(callback, tenantId?)` signature** (verified `packages/db/src/client.ts`):

- When called inside HTTP middleware with active ALS frame: `db.withTenant(callback)` reads tenantId from ALS.
- When called outside ALS (e.g. setTimeout callback): `db.withTenant(callback, tenantId)` accepts explicit tenantId per ADR-0020 I-6. Confirm against current `client.ts` signature; if the package's withTenant requires a different shape, adapt.

**Existing upsert service pattern (`upsert-modifier.service.ts` 23 lines — verified):**

- `@Injectable()` class with `constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}`.
- Single `execute(input): Promise<{ id: string }>` method.
- Inside: `const ctx = requireTenantContext(); const brandId = getBrandId() ?? null; return this.repo.upsertX({ ...(input.id ? { id: input.id } : {}), tenantId: ctx.tenantId, brandId, ...input fields ... });`.
  </interfaces>
  </context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Extend domain ports + published-menu read-model + refactor repository</name>
  <files>apps/api/src/contexts/catalog/domain/ports.ts, apps/api/src/contexts/catalog/domain/published-menu.ts, apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts</files>
  <read_first>
    apps/api/src/contexts/catalog/domain/ports.ts (full file — existing CatalogRepository + CatalogCachePort + UpsertXRow types)
    apps/api/src/contexts/catalog/domain/published-menu.ts (full file — existing PublishedMenu / PublishedMenuItem / PublishedMenuVariant / PublishedMenuModifier types)
    apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts (full 343-line file)
    .planning/phases/04a-catalog-schema-api/04A-PATTERNS.md (§catalog-drizzle.repository.ts — Key renames + sign-photos pattern + stop-list overlay)
    .planning/phases/04a-catalog-schema-api/04A-SCHEMA-MAP.md (§Downstream Consumer Inventory — catalog-drizzle.repository.ts row)
  </read_first>
  <action>
    Edit `apps/api/src/contexts/catalog/domain/ports.ts`:

    1. Extend `CatalogRepository` interface with new methods per `<interfaces>` block:
       - `upsertModifierGroup`, `upsertModifierOption`, `upsertItemSize`, `addToStopList`, `removeFromStopList`, `getMenuFirstPublishedAt`, `insertSlugAlias`.
    2. Add corresponding `UpsertModifierGroupRow`, `UpsertModifierOptionRow`, `UpsertItemSizeRow`, `StopListInsertRow` interfaces (shape per `<interfaces>` + PATTERNS.md §ports.ts UpsertXxxRow).
    3. Extend `CatalogCachePort` interface with `invalidate(tenantId: TenantId, version: number, brandId?: string | null): Promise<void>`.
    4. RENAME existing `UpsertModifierRow` → `UpsertModifierGroupRow` (and update the existing `upsertModifier` method to `upsertModifierGroup` returning same shape).

    Edit `apps/api/src/contexts/catalog/domain/published-menu.ts`:

    5. RENAME `PublishedMenuVariant` → `PublishedMenuItemSize`; change its `priceDelta` field to `price` (absolute, NOT delta).
    6. RENAME `PublishedMenuModifier` → `PublishedMenuModifierGroup`; rename `modifierOptions` → `modifierOptions` (same name but children belong to a group now).
    7. ADD `PublishedMenuItemPhoto` interface with `{ s3Key: string, sortOrder: number, alt?: string, isPrimary?: boolean, url: string }` (the `url` field is the presigned GET URL).
    8. Extend `PublishedMenuItem` per PATTERNS.md §published-menu.ts:
       - Replace `imageUrl: string | null` with both: `imageUrl: string | null` (backward-compat — first photo's presigned URL or null) AND `photos: readonly PublishedMenuItemPhoto[]`.
       - Rename `variants` → `sizes` typed as `readonly PublishedMenuItemSize[]`.
       - Rename `modifierIds` → `modifierGroupIds` typed as `readonly MenuModifierGroupId[]` (or `string[]`).
       - ADD `proteins: string | null` (decimal serialised as string), `fats: string | null`, `carbs: string | null`, `kcal: number | null`, `nutritionEstimated: boolean`.

    Edit `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts`:

    9. Apply all renames per PATTERNS.md §catalog-drizzle.repository.ts Key renames section:
       - `schema.menuVariants` → `schema.menuItemSizes` throughout.
       - `schema.menuModifiers` → `schema.menuModifierGroups` throughout.
       - `schema.menuItemModifiers` → `schema.menuItemModifierGroups` throughout.
       - `r.imageS3Key` → `r.photos` (array; cast/map photos through the new typed shape).
       - `m.modifierId` → `m.modifierGroupId` (junction table column).
       - `v.priceDelta` → `v.price` (absolute price).
    10. Add helper method `private async signPhotos(photos: MenuItemPhoto[]): Promise<PublishedMenuItemPhoto[]>` — `Promise.all` over the array, calling `this.imageUrl.presignGet(p.s3Key, IMAGE_URL_TTL_SECONDS)` for each, returning `{ ...p, url: presignedUrl }`.
    11. Refactor `loadPublishedMenu` per PATTERNS.md §catalog-drizzle.repository.ts Stop-list overlay:
        - Add `schema.menuStopList` to the `Promise.all` parallel selects.
        - Build `const stoppedItemIds = new Set(stopListRows.map(r => r.itemId))`.
        - Filter `itemsRows = itemsRows.filter(r => !stoppedItemIds.has(r.id))` before the modifier-group / size join queries fire (so stopped items are excluded from joins too).
        - In the per-item mapping, populate the new BJU fields + photos array on `PublishedMenuItem`.
    12. Refactor `upsertCategory` to handle the new `parentId` field on conflict update (add to `.set` block).
    13. Refactor `upsertItem`:
        - Accept `photos`, BJU, source, needsReview, sourceExternalId from `UpsertItemRow`.
        - When a slug change is detected (existing item has a different slug than the new one), call the new `insertSlugAlias` method in the same transaction.
    14. ADD new repository methods per Task 1 step 1:
        - `upsertModifierGroup` — exact copy of current `upsertModifier` against renamed `menuModifierGroups` table.
        - `upsertModifierOption` — insert/update against `menuModifierOptions` with `modifierGroupId` FK; handle `defaultAmount` + `freeAmount` columns.
        - `upsertItemSize` — insert/update against `menuItemSizes` with `menuItemId` FK; absolute `price`.
        - `addToStopList` — `scoped.insertInto(schema.menuStopList, { ... }).onConflictDoNothing().returning({ id: ... })`; if conflict (already stopped), re-select existing row id.
        - `removeFromStopList` — `scoped.deleteFrom(...)` is forbidden (resto_app has no DELETE per PROJECT.md) — instead use `db.withoutTenant('stop-list unstop — DELETE bypass', ...)` if necessary, OR redesign as soft-toggle (`status` column on `menu_stop_list` if needed). Per CTO note + RESEARCH.md, stop-list rows ARE deleted on unstop. Re-read `packages/db/sql/roles.sql` and `packages/db/migrations/0028_grant_delete_inbox_processed.sql` — `resto_app` has DELETE granted only on `inbox_processed`. For `menu_stop_list`, GRANT DELETE TO resto_app must be added via a follow-up migration OR the unstop path must run via `db.withoutTenant` with the `withoutTenant.allowlist` extended. **Resolution: extend `packages/db/sql/roles.sql` (or add a small migration in this plan) granting `DELETE ON menu_stop_list TO resto_app`. Add an entry in `packages/db/src/withoutTenant.allowlist.ts` if the implementation uses withoutTenant — confirm by inspecting the file.** Choose the GRANT-DELETE path (simpler; preserves RLS):
          - Create `packages/db/migrations/0040_catalog_phase4a_grant_delete_stop_list.sql`:
            - Header: `-- Phase 4a-06 step M: grant DELETE on menu_stop_list to resto_app for unstop path.`
            - `GRANT DELETE ON menu_stop_list TO resto_app;` --> statement-breakpoint
          - Register in `_journal.json` (idx after 0039).
          - `removeFromStopList` uses `scoped.deleteFrom(schema.menuStopList, eq(...))` normally (no `withoutTenant` needed).
        - `getMenuFirstPublishedAt` — `db.withTenant(async tx => scoped.selectFrom(schema.tenants, eq(schema.tenants.id, tenantId)).limit(1))` → return `row?.menuFirstPublishedAt ?? null`. (Use `db.withTenant` since tenantId is already known.)
        - `insertSlugAlias` — `scoped.insertInto(schema.menuItemSlugAliases, { tenantId, itemId, alias }).onConflictDoNothing()`.

  </action>
  <verify>
    <automated>grep -c "menuItemSizes\\|menuModifierGroups\\|menuItemModifierGroups" apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts &amp;&amp; ! grep -q "menuVariants\\|imageS3Key\\b" apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts &amp;&amp; grep -c "signPhotos\\|stopListRows" apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts &amp;&amp; pnpm --filter @resto/db typecheck</automated>
  </verify>
  <done>
    - Repository uses only new table names; old refs removed.
    - `signPhotos` helper exists and is called by `loadPublishedMenu`.
    - Stop-list overlay implemented (parallel select + filter).
    - 7 new port methods implemented.
    - `CatalogCachePort.invalidate` added.
    - GRANT DELETE migration 0040 created.
    - `packages/db` typecheck still green (no schema mismatch).
  </done>
  <acceptance_criteria>
    - `grep -c "menuVariants\\|menuModifiers\\b\\|menuItemModifiers\\b" apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` returns 0.
    - `grep -c "schema.menuItemSizes\\|schema.menuModifierGroups\\|schema.menuItemModifierGroups\\|schema.menuStopList\\|schema.menuItemSlugAliases" apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` returns ≥ 5.
    - `grep -c "imageS3Key" apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` returns 0.
    - `grep -c "signPhotos" apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` returns ≥ 2 (definition + call site).
    - `grep -c "stoppedItemIds\\|menuStopList" apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` returns ≥ 1.
    - `grep -c "upsertModifierGroup\\|upsertModifierOption\\|upsertItemSize\\|addToStopList\\|removeFromStopList\\|getMenuFirstPublishedAt\\|insertSlugAlias" apps/api/src/contexts/catalog/domain/ports.ts` returns ≥ 7.
    - `grep -c "invalidate(" apps/api/src/contexts/catalog/domain/ports.ts` returns ≥ 1.
    - `test -f packages/db/migrations/0040_catalog_phase4a_grant_delete_stop_list.sql`.
    - `grep -v '^--' packages/db/migrations/0040_catalog_phase4a_grant_delete_stop_list.sql | grep -c "GRANT DELETE ON menu_stop_list"` returns 1.
    - `grep -c "PublishedMenuItemSize\\|PublishedMenuModifierGroup\\|PublishedMenuItemPhoto" apps/api/src/contexts/catalog/domain/published-menu.ts` returns ≥ 3.
    - `pnpm --filter @resto/db typecheck` exits 0.
  </acceptance_criteria>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Refactor `redis-catalog-cache.adapter.ts` — nextval fallback + invalidate method</name>
  <files>apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts</files>
  <read_first>
    apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts (current 103-line shape)
    packages/db/src/client.ts (TenantAwareDb + withoutTenant signatures)
    .planning/phases/04a-catalog-schema-api/04A-PATTERNS.md (§redis-catalog-cache.adapter.ts — bump nextval fallback + invalidate method)
    .planning/phases/04a-catalog-schema-api/04A-RESEARCH.md (§Code Examples — MenuVersionPort)
  </read_first>
  <action>
    Edit `apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts`:

    1. Add imports: `import { sql } from 'drizzle-orm'`; `import { TenantAwareDb } from '@resto/db'` (or whatever the existing `withoutTenant` import path is — confirm with current `apps/api` repo). The constructor injects `TenantAwareDb` via the existing DI token — check `apps/api/src/contexts/catalog/catalog.module.ts` for how `RedisCatalogCacheAdapter` is wired; add a constructor parameter `@Inject(TenantAwareDb)` (or the equivalent token) alongside the existing `ENV_TOKEN` inject.

    2. Refactor `bump(tenantId)` (lines 65-73 currently): replace the `Date.now()` fallback in the catch block with the `nextval('menu_versions_seq')` fallback per RESEARCH.md §Code Examples:
       - Catch block:
         - Warn-log with `{ tenantId, err }` and message "Redis unavailable — falling back to menu_versions_seq."
         - `const result = await this.db.withoutTenant('menu version nextval fallback — Redis unavailable', async (tx) => tx.execute(sql\`SELECT nextval('menu_versions_seq') AS v\`))`.
         - Return `Number((result.rows[0] as { v: string }).v)`.
       - The structured warn-log format aligns with PROJECT.md logging convention (`logger.warn({ tenantId, err }, '...')`).

    3. Also handle the `if (!this.client) return Date.now()` early-return at the top of `bump()`: per CAT-10 + D-4a-07, when Redis is configured-out (no REDIS_URL), the sequence fallback is also the correct authoritative source. Replace this branch to call the same nextval path. (Two callers; refactor to a private `#nextvalBump()` helper.)

    4. Add new method `async invalidate(tenantId: TenantId, version: number, brandId?: string | null): Promise<void>`:
       - If `!this.client` return immediately.
       - Try `await this.client.del(MENU_KEY(tenantId, version, brandId ?? null))`.
       - Catch + warn-log.

    5. Update class signature: `implements CatalogCachePort, MenuVersionPort, OnApplicationShutdown` already lists CatalogCachePort — the new `invalidate` method satisfies the extended port (the port interface was updated in Task 1).

    6. Add `withoutTenant` allowlist entry — check `packages/db/src/withoutTenant.allowlist.ts` (if it exists) and add the call-site path + reason string `'menu version nextval fallback — Redis unavailable'`. If the allowlist uses ESLint per-file overrides (per PROJECT.md TEN-11/12), add a path entry for `redis-catalog-cache.adapter.ts` in `apps/api/eslint.config.mjs`. RESEARCH.md §Project Constraints confirms `withoutTenant` requires non-empty reason — the reason string above satisfies that.

    7. `current(tenantId)` and `get/set` methods are unchanged.

  </action>
  <verify>
    <automated>grep -c "menu_versions_seq" apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts &amp;&amp; grep -c "async invalidate" apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts &amp;&amp; grep -c "withoutTenant" apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts</automated>
  </verify>
  <done>
    - `bump()` falls back to `nextval('menu_versions_seq')` on Redis error AND on no-client case.
    - `invalidate(tenantId, version, brandId?)` method added.
    - `TenantAwareDb` injected.
    - `withoutTenant.allowlist` entry / ESLint override registered for the new call site.
  </done>
  <acceptance_criteria>
    - `grep -c "nextval('menu_versions_seq')" apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts` returns 1.
    - `grep -c "async invalidate" apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts` returns 1.
    - `grep -c "menu version nextval fallback" apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts` returns 1.
    - Allowlist registered: `grep -c "redis-catalog-cache" packages/db/src/withoutTenant.allowlist.ts 2>/dev/null` returns ≥ 1 OR ESLint override added in `apps/api/eslint.config.mjs`.
    - `pnpm --filter @resto/api lint` does not error on the `withoutTenant` rule for this file.
  </acceptance_criteria>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Create new services (DelayedPublish, PublishMenu refactor, StopList, UpsertModifierGroup/Option/ItemSize) + refactor UpsertCategory/Item for slug auto-derive + wire catalog.module.ts</name>
  <files>apps/api/src/contexts/catalog/application/delayed-publish.service.ts, apps/api/src/contexts/catalog/application/publish-menu.service.ts, apps/api/src/contexts/catalog/application/stop-list.service.ts, apps/api/src/contexts/catalog/application/upsert-modifier-group.service.ts, apps/api/src/contexts/catalog/application/upsert-modifier-option.service.ts, apps/api/src/contexts/catalog/application/upsert-item-size.service.ts, apps/api/src/contexts/catalog/application/upsert-category.service.ts, apps/api/src/contexts/catalog/application/upsert-item.service.ts, apps/api/src/contexts/catalog/application/get-published-menu.service.ts, apps/api/src/contexts/catalog/catalog.module.ts</files>
  <read_first>
    apps/api/src/contexts/catalog/application/upsert-modifier.service.ts (23-line analog for new upsert services)
    apps/api/src/contexts/catalog/application/publish-menu.service.ts (current 20-line file — refactor to add doPublish + remove execute or keep as schedule wrapper)
    apps/api/src/contexts/catalog/application/upsert-category.service.ts (existing — extend for parentId + slug auto-derive)
    apps/api/src/contexts/catalog/application/upsert-item.service.ts (existing — extend for photos, BJU, source, slug auto-derive + alias)
    apps/api/src/contexts/catalog/application/get-published-menu.service.ts (existing — propagate new fields to DTO mapping if applicable)
    apps/api/src/contexts/catalog/catalog.module.ts (current providers list — must add 4 new services)
    .planning/phases/04a-catalog-schema-api/04A-PATTERNS.md (§delayed-publish.service.ts; §publish-menu.service.ts refactor; §stop-list.service.ts; §upsert-modifier-group.service.ts; §upsert-item-size.service.ts; §catalog.module.ts)
    .planning/phases/04a-catalog-schema-api/04A-RESEARCH.md (§Pattern 1 Delayed-Publish; §Pattern 3 First-Publish Detection; §Pattern 4 Cyrillic Slug Auto-Transliteration; §Pitfall 1 timer-lost; §Pitfall 7 setTimeout ALS escape)
  </read_first>
  <action>
    Create `apps/api/src/contexts/catalog/application/delayed-publish.service.ts` per RESEARCH.md §Pattern 1 + PATTERNS.md §delayed-publish.service.ts:
    - `@Injectable() class DelayedPublishService implements OnModuleDestroy`.
    - Logger `new Logger(DelayedPublishService.name)`.
    - Constructor injects `PublishMenuService` via `@Inject(PublishMenuService)`.
    - Private fields: `readonly #pending = new Map<string, { timerId: NodeJS.Timeout }>()`, `readonly #DELAY_MS = 5_000`.
    - Method `schedule(tenantId: string): { cancel: () => boolean }`:
      - Cancels any existing pending timer for this tenant via private helper.
      - Local `let cancelled = false`.
      - `const timerId = setTimeout(() => { if (!cancelled) { this.#pending.delete(tenantId); void this.publisher.doPublish(tenantId).catch(err => this.logger.error({ tenantId, err }, 'Delayed publish failed.')); } }, this.#DELAY_MS)`.
      - Set the new entry. Return `{ cancel: () => { if (this.#pending.has(tenantId)) { /* clear, mark cancelled */ return true; } return false; } }`.
    - Method `onModuleDestroy()`: iterate `#pending`, `clearTimeout` each, clear map.
    - Pitfall 1 documentation: leave a code comment referencing RESEARCH.md §Pitfall 1 noting that timers are lost on process restart; the read path has no compensating event because nothing was written.

    Refactor `apps/api/src/contexts/catalog/application/publish-menu.service.ts`:
    - REMOVE `execute(): Promise<...>` (current 20-line bump-only).
    - ADD `async doPublish(tenantId: string): Promise<{ version: number }>` per RESEARCH.md §Pattern 3:
      - Constructor injects `@Inject(MENU_VERSION_PORT) versions`, `@Inject(CATALOG_REPOSITORY) repo`, plus `db: TenantAwareDb`.
      - Inside `await this.db.withTenant(async (tx, _scoped) => { ... }, tenantId)` (ADR-0020 I-6):
        - `const version = await this.versions.bump(tenantId)`.
        - `const firstAt = await this.repo.getMenuFirstPublishedAt(tenantId)`.
        - If `firstAt === null`:
          - `await tx.update(schema.tenants).set({ menuFirstPublishedAt: new Date() }).where(eq(schema.tenants.id, tenantId))`.
          - `await appendToOutbox(tx, { envelope: buildEnvelope(MenuFirstPublishedV1, { tenantId, version }) })`.
        - Else: `await appendToOutbox(tx, { envelope: buildEnvelope(MenuRepublishedV1, { tenantId, version }) })`.
      - Return `{ version }`.
    - Logger `new Logger(PublishMenuService.name)`.

    Create `apps/api/src/contexts/catalog/application/stop-list.service.ts`:
    - `@Injectable() class StopListService`.
    - Constructor injects `@Inject(CATALOG_REPOSITORY) repo`, `@Inject(CATALOG_CACHE_PORT) cachePort`, `@Inject(MENU_VERSION_PORT) versions`, plus `db: TenantAwareDb`.
    - Method `async stop(input: StopItemInput): Promise<{ id: string }>`:
      - `const ctx = requireTenantContext(); const brandId = getBrandId() ?? null`.
      - Resolve the item slug (read from `menu_items` via repo helper or scoped select inside withTenant).
      - `await this.db.withTenant(async (tx, _scoped) => { ... })`:
        - Call `repo.addToStopList({ itemId, tenantId: ctx.tenantId, brandId, reason, stoppedByUserId })`.
        - `await appendToOutbox(tx, { envelope: buildEnvelope(ItemStoppedV1, { tenantId: ctx.tenantId, itemId, itemSlug, stoppedByUserId, stoppedAt: new Date() }) })`.
      - AFTER transaction: `const currentVersion = await this.versions.current(ctx.tenantId)`; `await this.cachePort.invalidate(ctx.tenantId, currentVersion, brandId)` (Option B per RESEARCH.md Pattern 2).
      - Return `{ id }`.
    - Method `async unstop(itemId: string): Promise<void>` — mirror shape, emit `ItemUnstoppedV1`, also call cache invalidate.

    Create `apps/api/src/contexts/catalog/application/upsert-modifier-group.service.ts` per PATTERNS.md (23-line analog of `upsert-modifier.service.ts`):
    - `@Injectable()`, constructor injects `@Inject(CATALOG_REPOSITORY) repo`.
    - `async execute(input: UpsertModifierGroupInput): Promise<{ id: string }>` — `requireTenantContext + getBrandId + repo.upsertModifierGroup(...)`.

    Create `apps/api/src/contexts/catalog/application/upsert-modifier-option.service.ts` per PATTERNS.md:
    - Analog shape; takes `UpsertModifierOptionInput`; calls `repo.upsertModifierOption(...)`.

    Create `apps/api/src/contexts/catalog/application/upsert-item-size.service.ts` per PATTERNS.md:
    - Analog shape; takes `UpsertItemSizeInput`; calls `repo.upsertItemSize(...)`. Cast `input.price as MoneyAmount` per PATTERNS.md.

    Refactor `apps/api/src/contexts/catalog/application/upsert-category.service.ts`:
    - Import `slugify` from `transliteration`.
    - When `input.slug` is absent: derive via the `normalizeSlug` helper (PATTERNS.md §Pattern 4) from `input.name[defaultLocale]`. The default locale is read from `LocalizedText.defaultLocale` (verify in `@resto/domain`) or hardcoded `'ru'` if exposed.
    - Pass derived slug + `parentId` to `repo.upsertCategory(...)`.

    Refactor `apps/api/src/contexts/catalog/application/upsert-item.service.ts`:
    - Same slug auto-derive pattern.
    - Pass `photos`, `proteins`, `fats`, `carbs`, `kcal`, `nutritionEstimated`, `source`, `needsReview`, `sourceExternalId` to `repo.upsertItem(...)`.
    - On UPDATE path (when `input.id` is provided): fetch existing item; if `existing.slug !== newSlug`, call `repo.insertSlugAlias({ itemId: existing.id, tenantId, alias: existing.slug })` inside the same `db.withTenant`.

    Refactor `apps/api/src/contexts/catalog/application/get-published-menu.service.ts`:
    - If the service maps repository rows to DTO, propagate `photos`, BJU, sizes (renamed), modifierGroupIds — most of the work is in the repository; verify the service is a thin pass-through.

    Update `apps/api/src/contexts/catalog/catalog.module.ts`:
    - Replace `UpsertModifierService` provider with `UpsertModifierGroupService`.
    - Add new providers: `UpsertModifierOptionService`, `UpsertItemSizeService`, `StopListService`, `DelayedPublishService`.
    - Add `TenantAwareDb` injection to `RedisCatalogCacheAdapter` if not already wired (the module composes via DI tokens).
    - Verify `PublishMenuService` provider stays (its public method changes to `doPublish` but the class is still registered).

  </action>
  <verify>
    <automated>test -f apps/api/src/contexts/catalog/application/delayed-publish.service.ts &amp;&amp; test -f apps/api/src/contexts/catalog/application/stop-list.service.ts &amp;&amp; test -f apps/api/src/contexts/catalog/application/upsert-modifier-group.service.ts &amp;&amp; test -f apps/api/src/contexts/catalog/application/upsert-modifier-option.service.ts &amp;&amp; test -f apps/api/src/contexts/catalog/application/upsert-item-size.service.ts &amp;&amp; grep -c "doPublish" apps/api/src/contexts/catalog/application/publish-menu.service.ts &amp;&amp; grep -c "DelayedPublishService" apps/api/src/contexts/catalog/catalog.module.ts &amp;&amp; pnpm --filter @resto/api typecheck</automated>
  </verify>
  <done>
    - All 5 new service files exist with correct shape.
    - PublishMenuService has `doPublish` (no longer `execute`); uses `withTenant` + `appendToOutbox` + `buildEnvelope`.
    - DelayedPublishService implements `OnModuleDestroy`.
    - StopListService emits outbox events + invalidates cache.
    - UpsertCategoryService and UpsertItemService auto-derive slug + insert alias on change.
    - catalog.module.ts registers all new providers.
    - `pnpm --filter @resto/api typecheck` exits 0.
  </done>
  <acceptance_criteria>
    - `grep -c "OnModuleDestroy" apps/api/src/contexts/catalog/application/delayed-publish.service.ts` returns ≥ 1.
    - `grep -c "#DELAY_MS = 5_000\\|#DELAY_MS = 5000" apps/api/src/contexts/catalog/application/delayed-publish.service.ts` returns ≥ 1.
    - `grep -c "MenuFirstPublishedV1\\|MenuRepublishedV1" apps/api/src/contexts/catalog/application/publish-menu.service.ts` returns ≥ 2.
    - `grep -c "buildEnvelope" apps/api/src/contexts/catalog/application/publish-menu.service.ts` returns ≥ 2.
    - `grep -c "appendToOutbox" apps/api/src/contexts/catalog/application/publish-menu.service.ts` returns ≥ 2.
    - `grep -c "db.withTenant" apps/api/src/contexts/catalog/application/publish-menu.service.ts` returns ≥ 1.
    - `grep -c "ItemStoppedV1\\|ItemUnstoppedV1" apps/api/src/contexts/catalog/application/stop-list.service.ts` returns ≥ 2.
    - `grep -c "cachePort.invalidate\\|cacheport.invalidate" apps/api/src/contexts/catalog/application/stop-list.service.ts` returns ≥ 2.
    - `grep -c "slugify\\|normalizeSlug" apps/api/src/contexts/catalog/application/upsert-item.service.ts` returns ≥ 1.
    - `grep -c "insertSlugAlias\\|slugAliases" apps/api/src/contexts/catalog/application/upsert-item.service.ts` returns ≥ 1.
    - `grep -c "parentId" apps/api/src/contexts/catalog/application/upsert-category.service.ts` returns ≥ 1.
    - `grep -c "DelayedPublishService\\|StopListService\\|UpsertModifierGroupService\\|UpsertModifierOptionService\\|UpsertItemSizeService" apps/api/src/contexts/catalog/catalog.module.ts` returns ≥ 5.
    - `pnpm --filter @resto/api typecheck` exits 0.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                                                   | Description                                                                                                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP → DelayedPublishService.schedule                      | Trusted (after AuthGuard + InternalTokenGuard); but timer state crosses request boundary                                                                                  |
| setTimeout callback → db.withTenant                        | ADR-0020 I-6 — ALS frame is gone; must pass tenantId explicitly                                                                                                           |
| StopListService → outbox + cache                           | Two side effects must agree; cache invalidation runs after tx commit                                                                                                      |
| RedisCatalogCacheAdapter.bump fallback → menu_versions_seq | Sequence is the authoritative source when Redis fails; risk of duplicate version numbers across Redis-recovery boundary (accept — every version is still globally unique) |

## STRIDE Threat Register

| Threat ID   | Category       | Component                                               | Disposition | Mitigation Plan                                                                                                                                                                                               |
| ----------- | -------------- | ------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-04a-06-01 | InfoDisclosure | DelayedPublishService timer leak across tenants         | mitigate    | `#pending` is keyed by `tenantId`; double-click on tenant A does not affect tenant B's timer; map cleared in `onModuleDestroy` (no state retained beyond process lifetime)                                    |
| T-04a-06-02 | Tampering      | setTimeout escapes ALS → cross-tenant write             | mitigate    | RESEARCH.md Pitfall 7: callback uses `db.withTenant(callback, tenantId)` with explicit tenantId param (ADR-0020 I-6); NO `requireTenantContext()` in setTimeout body                                          |
| T-04a-06-03 | DoS            | Outbox event flood from concurrent publish clicks       | mitigate    | Each `schedule(tenantId)` cancels the previous timer before installing a new one; only ONE `doPublish` runs per tenant per cycle; outbox event emitted only after 5s window completes                         |
| T-04a-06-04 | Tampering      | Stop-list write without cache invalidation → stale read | mitigate    | StopListService calls `cachePort.invalidate` AFTER transaction commit (Option B per RESEARCH.md Pattern 2); minor stale-read window only during Redis lag                                                     |
| T-04a-06-05 | Tampering      | First-publish event emitted twice (race)                | mitigate    | `getMenuFirstPublishedAt` is read inside the same `db.withTenant` tx as the `UPDATE tenants SET menu_first_published_at = NOW()`; tx isolation prevents double-fire                                           |
| T-04a-06-06 | InfoDisclosure | Redis nextval fallback exposes sequence across tenants  | accept      | `menu_versions_seq` is a GLOBAL Postgres sequence (per SCHEMA-MAP §Q3 + Assumption A3 in RESEARCH.md); version numbers are not monotonic per-tenant but are globally unique cache-bust keys; no logical issue |
| T-04a-06-07 | Tampering      | Slug alias spoofing                                     | mitigate    | `insertSlugAlias` uses `onConflictDoNothing` + composite FK to `menu_items(id, tenant_id)` + RLS — tenant A cannot insert an alias claiming tenant B's slug                                                   |
| T-04a-06-08 | DoS            | Slug alias inflation                                    | mitigate    | Aliases only created on slug CHANGE (not on every UPDATE); plan-07 e2e test asserts idempotent UPDATE does not insert a new alias row                                                                         |
| T-04a-06-09 | Tampering      | `withoutTenant` in cache adapter unauthorized           | mitigate    | Reason string `'menu version nextval fallback — Redis unavailable'`; allowlist updated (Task 2); audit log records the bypass                                                                                 |

</threat_model>

<verification>
- `pnpm --filter @resto/api typecheck` exits 0.
- `pnpm --filter @resto/api lint` exits 0 (withoutTenant allowlist rule passes).
- `pnpm --filter @resto/db typecheck` exits 0.
- `pnpm --filter @resto/db db:migrate` applies 0040 (GRANT DELETE) cleanly.
- All grep gates from `<acceptance_criteria>` pass.
- The existing catalog Vitest unit suite passes (some tests will need shape updates — plan 07 handles the e2e specs; in-context unit tests in `apps/api/src/contexts/catalog/**/*.spec.ts` if present should be updated alongside source refactor).
</verification>

<success_criteria>

- CAT-06: Delayed-publish revert mechanism implemented (5s in-memory timer per tenant; first-publish vs republish distinct events).
- CAT-10: Redis menu-version with Postgres nextval fallback wired into `MenuVersionPort.bump()`.
- D-4a-04: Slug auto-derive via `transliteration` + alias insert on slug change.
- D-4a-05: Delayed-publish honest with outbox (no compensating events).
- D-4a-06: `MenuFirstPublishedV1` and `MenuRepublishedV1` outbox events emitted at the correct trigger.
- D-4a-07: Redis nextval fallback consistent on Redis outage.
- D-4a-10: Stop-list overlay at read time; mutations invalidate the version-keyed cache key (Option B).
- Repository fully refactored against renamed tables + photos JSONB + BJU.
- Module wiring complete; `apps/api` typecheck green.
  </success_criteria>

<output>
Create `.planning/phases/04a-catalog-schema-api/04A-06-SUMMARY.md` when done summarizing:
- List of new service files + their responsibilities.
- The doPublish flow diagram (controller → DelayedPublishService → 5s → PublishMenuService.doPublish → tx{ bump, getFirstAt, conditional outbox emit } → cache invalidate path).
- The exact rename map applied in the repository.
- The MenuVersionPort fallback chain (Redis → nextval).
- Confirmation that Pitfall 1 (timer lost on restart) is documented in code + acknowledged for Phase 4b to add the persistent pending-publish marker table if/when needed.
- `apps/api/eslint.config.mjs` + `withoutTenant.allowlist.ts` changes for the new bypass call site.
</output>
