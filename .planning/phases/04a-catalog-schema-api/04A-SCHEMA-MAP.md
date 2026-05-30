---
phase: 04a-catalog-schema-api
produced: 2026-05-30
sources:
  - https://github.com/kebrick/pyiikocloudapi/blob/main/pyiikocloudapi/models.py
  - https://pkg.go.dev/github.com/wollzy/iiko-go
  - https://github.com/salesduck/iiko-cloud-api
  - /Users/mp_dev/projects/RestOS/packages/db/src/schema/menu.ts (current schema, verified)
  - /Users/mp_dev/projects/RestOS/apps/api/src/contexts/catalog/ (current context, verified)
  - /Users/mp_dev/projects/RestOS/apps/qr-menu/src/api/types.ts (consumer DTO, verified)
---

# Phase 4a Schema Map — iiko Nomenclature → RestOS Catalog

> iiko field names verified via pyiikocloudapi Pydantic models and wollzy/iiko-go Go structs.
> iiko internal docs (ru.iiko.help SPA) were not reachable from web fetch; field shapes are CONFIRMED
> from two independent SDK implementations with HIGH confidence.
> RestOS current schema confirmed by direct code read.

## Entity Mapping Table

| iiko entity (Russian + English)                           | iiko fields (required vs optional, types)                                                                                                                                                                                                                                                                                                                                                                                          | Current RestOS equivalent                                                                                                       | Proposed RestOS entity                                                                                                                                                     | Migration impact                                                                                                                                                                                                                                                                                                                                   | Downstream consumers affected                                                                                                                                                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Группа (Group/Category)**                               | `id` UUID req, `name` str req, `parent_group` UUID opt, `order` int req, `is_included_in_menu` bool req, `is_group_modifier` bool req, `image_links` list req, `code` str opt, `description` str opt, `seo_description/text/keywords/title` str opt, `tags` list opt, `is_deleted` bool opt                                                                                                                                        | `menu_categories` (flat, no parent)                                                                                             | `menu_categories` — add nullable `parent_id` self-FK for tree; keep flat in MVP-1 UI                                                                                       | ADD `parent_id UUID NULLABLE` + composite FK `(parent_id, tenant_id)` → `menu_categories(id, tenant_id)`; data migration trivial (NULL all existing rows)                                                                                                                                                                                          | Phase 4b admin IA sidebar; Phase 5 website category tree rendering; Phase 6 qr-menu category nav                                                                                                                                         |
| **Блюдо / Продукт (Product/Dish)**                        | `id` UUID req, `name` str req, `group_id` UUID opt, `order_item_type` str req, `splittable` bool req, `measure_unit` str req, `size_prices` list req, `modifiers` list req, `group_modifiers` list req, `image_links` list req, `weight` float opt, `fat_amount` float opt, `proteins_amount` float opt, `carbohydrates_amount` float opt, `energy_amount` float opt, `code` str opt, `description` str opt, `is_deleted` bool opt | `menu_items` with `imageS3Key TEXT`, no BJU fields, no `source`                                                                 | `menu_items` — drop `imageS3Key`, add `photos JSONB NOT NULL DEFAULT '[]'`, add BJU fields, add `source` enum, add `stopped_at`, add `first_published_at` on tenants table | DROP `image_s3_key`; ADD `photos JSONB`, `proteins DECIMAL(5,2)`, `fats DECIMAL(5,2)`, `carbs DECIMAL(5,2)`, `kcal SMALLINT`, `nutrition_estimated BOOLEAN DEFAULT false`, `source TEXT DEFAULT 'manual'`, `needs_review BOOLEAN DEFAULT false`, `source_external_id TEXT`; ADD status value `'stopped'` or separate table (see stop-list section) | qr-menu `MenuItemDto.imageUrl` → `photos[0]`; api-client gen DTO; catalog.e2e.spec.ts; cross-tenant-isolation.e2e.spec.ts                                                                                                                |
| **Размер (Size)**                                         | `id` UUID req, `name` str req, `priority` int opt, `is_default` bool opt; pricing via `NPSizePriceModel`: `size_id` UUID opt, `price.current_price` float req, `price.is_included_in_menu` bool req                                                                                                                                                                                                                                | `menu_variants` — per-item, not reusable, stores `price_delta` not absolute price                                               | **KEEP `menu_variants` with rename to `menu_item_sizes`** (per recommendation below) — change `price_delta` to absolute `price` per size; add `is_default`                 | RENAME table `menu_variants` → `menu_item_sizes`; CHANGE `price_delta numeric(12,2)` → `price numeric(12,2)`; column `name` stays as `LocalizedText`; composite FK preserved                                                                                                                                                                       | Phase 7 cart_line must reference `(item_id, size_id)` not `(item_id, variant_id)` — annotate now, enforce in Phase 7; catalog-drizzle.repository.ts `variants` mapping; `PublishedMenuVariant` interface                                 |
| **Модификатор (Modifier — leaf option)**                  | In iiko, individual modifier is a product reference in `NPModifierModel`: `id` UUID req (product id), `default_amount` int opt, `min_amount` int req, `max_amount` int req, `required` bool opt, `hide_if_default_amount` bool opt, `free_of_charge_amount` int opt                                                                                                                                                                | `menu_modifier_options` — option within a group                                                                                 | `menu_modifier_options` — largely correct already; add `free_amount` int (iiko `free_of_charge_amount`), `default_amount` int                                              | ADD `default_amount SMALLINT DEFAULT 0`, `free_amount SMALLINT DEFAULT 0`; composite FK preserved                                                                                                                                                                                                                                                  | `PublishedMenuModifierOption` interface needs new fields                                                                                                                                                                                 |
| **Группа модификаторов (Modifier Group)**                 | `id` UUID req, `min_amount` int req, `max_amount` int req, `required` bool req, `child_modifiers` list req, `child_modifiers_have_min_max_restrictions` bool opt, `hide_if_default_amount` bool opt                                                                                                                                                                                                                                | `menu_modifiers` — ALREADY models this correctly (has `min_selectable`, `max_selectable`, `is_required`) — naming mismatch only | **RENAME `menu_modifiers` → `menu_modifier_groups`** — this is a naming cleanup, not a structural change; `menu_modifier_options` stays                                    | RENAME table `menu_modifiers` → `menu_modifier_groups`; update all FKs by name; no column changes needed                                                                                                                                                                                                                                           | All code referencing `schema.menuModifiers`; `UpsertModifierInputSchema` becomes `UpsertModifierGroupInputSchema`; `PublishedMenuModifier` → `PublishedMenuModifierGroup`; catalog-drizzle.repository.ts; internal-catalog.controller.ts |
| **Стоп-лист (Stop List)**                                 | iiko stop-list is terminal-group scoped: `TerminalGroupStopListItem: { id, name, is_deleted }`; managed via dedicated API endpoints (add to / remove from stop-list per terminal); NOT a property of the product itself                                                                                                                                                                                                            | None — current `menu_items.status` has no `stopped` state                                                                       | **NEW: `menu_stop_list` table** (see rationale in research doc)                                                                                                            | NEW TABLE `menu_stop_list` with composite FK `(item_id, tenant_id)` → `menu_items(id, tenant_id)`; columns: `id`, `tenant_id`, `item_id`, `brand_id`, `stopped_at`, `reason TEXT NULLABLE`, `stopped_by_user_id TEXT NULLABLE`                                                                                                                     | Phase 4b stop-list UI; `catalog.item_stopped.v1` / `catalog.item_unstopped.v1` events; public `/v1/menu` read path must join or exclude stopped items; qr-menu types.ts                                                                  |
| **ТТК — Технико-технологическая карта (Recipe/TechCard)** | Full entity in iiko: ingredients list with product references + amounts; cost-of-goods workflow. iiko provides this in the enterprise module, not in the basic nomenclature endpoint                                                                                                                                                                                                                                               | None                                                                                                                            | **NOT MODELED IN 4a** — only structured BJU fields (proteins/fats/carbs/kcal) on `menu_items`; full ТТК deferred to v2                                                     | No migration needed in 4a beyond BJU columns on `menu_items`; schema DOES NOT block v2 ТТК (a separate `menu_item_recipes` table can reference `menu_items.id` later)                                                                                                                                                                              | None in 4a — future only                                                                                                                                                                                                                 |
| **Слаг + алиасы (Slug + Aliases)**                        | Not an iiko concept — SEO-only                                                                                                                                                                                                                                                                                                                                                                                                     | `menu_items.slug TEXT UNIQUE (tenant_id, slug)`                                                                                 | Keep current slug; ADD `menu_item_slug_aliases` table                                                                                                                      | NEW TABLE `menu_item_slug_aliases` with composite FK `(item_id, tenant_id)` → `menu_items(id, tenant_id)` + UNIQUE `(tenant_id, alias)`                                                                                                                                                                                                            | Phase 5 website routing (301 redirect from alias → current slug); qr-menu deep links                                                                                                                                                     |
| **Первая публикация (First Publish Event)**               | Not an iiko concept                                                                                                                                                                                                                                                                                                                                                                                                                | `catalog.menu_published.v1` (single event type)                                                                                 | Two event types: `catalog.menu_first_published.v1` + `catalog.menu_republished.v1`; `tenants` table gets `menu_first_published_at TIMESTAMP NULLABLE`                      | ADD `menu_first_published_at` to `tenants` table; new event contracts                                                                                                                                                                                                                                                                              | Phase 13 analytics; Phase 14 marketing automation; audit pipeline `ACTION_TARGET_KIND`                                                                                                                                                   |
| **Версия меню (Menu Version)**                            | Not an iiko concept — internal caching                                                                                                                                                                                                                                                                                                                                                                                             | Redis key + `MenuVersionPort.bump()`                                                                                            | Redis primary + Postgres sequence `menu_versions_seq` fallback                                                                                                             | CREATE SEQUENCE `menu_versions_seq` owned by tenant+version pairing; modify `MenuVersionPort`                                                                                                                                                                                                                                                      | `redis-catalog-cache.adapter.ts` fallback path                                                                                                                                                                                           |

## Recommended Target Schema (Drizzle sketches)

### Drizzle table: menu_categories (extended)

```ts
export const menuCategories = pgTable(
  'menu_categories',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    brandId: uuid('brand_id'),
    parentId: uuid('parent_id'),            // NEW: nullable self-FK for iiko Группа tree
    slug: text('slug').notNull(),
    name: jsonb('name').$type<LocalizedText>().notNull(),
    description: jsonb('description').$type<LocalizedText>(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestampsColumns(),
  },
  (table) => [
    foreignKey({ name: 'menu_categories_tenant_fk', ... }),
    // NEW composite self-FK for parent (ADR-0020 I-2):
    compositeTenantFk({
      name: 'menu_categories_parent_fk',
      child: { id: table.parentId, tenantId: table.tenantId },
      parent: { id: menuCategories.id, tenantId: menuCategories.tenantId },
    }).onDelete('restrict'),
    uniqueIndex('menu_categories_tenant_slug_uq').on(table.tenantId, table.slug),
    tenantParentUniqueIndex('menu_categories', { id: table.id, tenantId: table.tenantId }),
    // RLS: ENABLE + FORCE on this table (already set in existing migration)
  ],
);
```

### Drizzle table: menu_items (extended)

```ts
export const menuItems = pgTable(
  'menu_items',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    brandId: uuid('brand_id'),
    categoryId: uuid('category_id').notNull(),
    slug: text('slug').notNull(),
    name: jsonb('name').$type<LocalizedText>().notNull(),
    description: jsonb('description').$type<LocalizedText>(),
    basePrice: money('base_price').notNull(),
    currency: text('currency').notNull(),
    // REMOVED: imageS3Key
    // NEW: forward-compat photo array
    photos: jsonb('photos')
      .$type<MenuItemPhoto[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    allergens: text('allergens').array(),
    // NEW: BJU (per 100g, all nullable)
    proteins: numeric('proteins', { precision: 5, scale: 2 }),
    fats: numeric('fats', { precision: 5, scale: 2 }),
    carbs: numeric('carbs', { precision: 5, scale: 2 }),
    kcal: smallint('kcal'),
    nutritionEstimated: boolean('nutrition_estimated').notNull().default(false),
    // NEW: provenance
    source: text('source').notNull().default('manual'),
    needsReview: boolean('needs_review').notNull().default(false),
    sourceExternalId: text('source_external_id'),
    status: text('status').notNull().default('draft'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestampsColumns(),
  },
  (table) => [
    // ... existing FKs preserved ...
    check(
      'menu_items_source_chk',
      sql`${table.source} IN ('manual','ai_generated','imported_iiko','imported_csv')`,
    ),
    check(
      'menu_items_status_chk',
      sql`${table.status} IN ('draft','published','archived')`,
    ),
    // RLS: ENABLE + FORCE (already set)
  ],
);

// Type for photos column
export interface MenuItemPhoto {
  s3Key: string;
  sortOrder: number;
  alt?: string;
  width?: number;
  height?: number;
  isPrimary?: boolean;
}
```

### Drizzle table: menu_item_sizes (renamed from menu_variants)

```ts
// RENAME: menu_variants → menu_item_sizes
// CHANGE: price_delta → price (absolute, not delta)
export const menuItemSizes = pgTable(
  'menu_item_sizes',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    brandId: uuid('brand_id'),
    menuItemId: uuid('menu_item_id').notNull(),
    name: jsonb('name').$type<LocalizedText>().notNull(),
    price: money('price').notNull(),          // CHANGED: was price_delta, now absolute price
    isDefault: boolean('is_default').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestampsColumns(),
  },
  (table) => [
    foreignKey({ name: 'menu_item_sizes_tenant_fk', ... }),
    compositeTenantFk({
      name: 'menu_item_sizes_item_fk',
      child: { id: table.menuItemId, tenantId: table.tenantId },
      parent: { id: menuItems.id, tenantId: menuItems.tenantId },
    }).onDelete('cascade'),
    tenantParentUniqueIndex('menu_item_sizes', { id: table.id, tenantId: table.tenantId }),
    // RLS: ENABLE + FORCE
  ],
);
```

### Drizzle table: menu_modifier_groups (renamed from menu_modifiers)

```ts
// RENAME: menu_modifiers → menu_modifier_groups
// No column changes needed
export const menuModifierGroups = pgTable(
  'menu_modifier_groups',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    brandId: uuid('brand_id'),
    name: jsonb('name').$type<LocalizedText>().notNull(),
    minSelectable: integer('min_selectable').notNull().default(0),
    maxSelectable: integer('max_selectable').notNull().default(1),
    isRequired: boolean('is_required').notNull().default(false),
    ...timestampsColumns(),
  },
  (table) => [
    foreignKey({ name: 'menu_modifier_groups_tenant_fk', ... }),
    tenantParentUniqueIndex('menu_modifier_groups', { id: table.id, tenantId: table.tenantId }),
    // RLS: ENABLE + FORCE
  ],
);
```

### Drizzle table: menu_modifier_options (extended)

```ts
// FK rename to point at menu_modifier_groups
export const menuModifierOptions = pgTable(
  'menu_modifier_options',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    brandId: uuid('brand_id'),
    modifierGroupId: uuid('modifier_group_id').notNull(),   // RENAMED column: modifier_id → modifier_group_id
    name: jsonb('name').$type<LocalizedText>().notNull(),
    priceDelta: money('price_delta').notNull().default('0'),
    defaultAmount: smallint('default_amount').notNull().default(0),   // NEW
    freeAmount: smallint('free_amount').notNull().default(0),          // NEW
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestampsColumns(),
  },
  (table) => [
    foreignKey({ name: 'menu_modifier_options_tenant_fk', ... }),
    compositeTenantFk({
      name: 'menu_modifier_options_group_fk',
      child: { id: table.modifierGroupId, tenantId: table.tenantId },
      parent: { id: menuModifierGroups.id, tenantId: menuModifierGroups.tenantId },
    }).onDelete('cascade'),
    // RLS: ENABLE + FORCE
  ],
);
```

### Drizzle table: menu_item_modifier_groups (junction — renamed)

```ts
// RENAME: menu_item_modifiers → menu_item_modifier_groups
// FK column rename: modifier_id → modifier_group_id
export const menuItemModifierGroups = pgTable(
  'menu_item_modifier_groups',
  {
    tenantId: tenantIdColumn(),
    brandId: uuid('brand_id'),
    menuItemId: uuid('menu_item_id').notNull(),
    modifierGroupId: uuid('modifier_group_id').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    primaryKey({ name: 'menu_item_modifier_groups_pk', columns: [table.menuItemId, table.modifierGroupId] }),
    compositeTenantFk({ name: 'menu_item_modifier_groups_item_fk', ... }),
    compositeTenantFk({ name: 'menu_item_modifier_groups_group_fk', ... }),
  ],
);
```

### NEW Drizzle table: menu_stop_list

```ts
export const menuStopList = pgTable(
  'menu_stop_list',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    brandId: uuid('brand_id'),
    itemId: uuid('item_id').notNull(),
    stoppedAt: timestamp('stopped_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    reason: text('reason'), // MVP-1 nullable; v2 UI can expose it
    stoppedByUserId: text('stopped_by_user_id'), // actor for analytics
  },
  (table) => [
    foreignKey({
      name: 'menu_stop_list_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'menu_stop_list_item_fk',
      child: { id: table.itemId, tenantId: table.tenantId },
      parent: { id: menuItems.id, tenantId: menuItems.tenantId },
    }).onDelete('cascade'),
    uniqueIndex('menu_stop_list_item_tenant_uq').on(
      table.tenantId,
      table.itemId,
    ), // one stop-list row per item
    tenantParentUniqueIndex('menu_stop_list', {
      id: table.id,
      tenantId: table.tenantId,
    }),
    // RLS: ENABLE + FORCE
  ],
);
```

### NEW Drizzle table: menu_item_slug_aliases

```ts
export const menuItemSlugAliases = pgTable(
  'menu_item_slug_aliases',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    itemId: uuid('item_id').notNull(),
    alias: text('alias').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    foreignKey({
      name: 'menu_item_slug_aliases_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'menu_item_slug_aliases_item_fk',
      child: { id: table.itemId, tenantId: table.tenantId },
      parent: { id: menuItems.id, tenantId: menuItems.tenantId },
    }).onDelete('cascade'),
    uniqueIndex('menu_item_slug_aliases_tenant_alias_uq').on(
      table.tenantId,
      table.alias,
    ),
    check(
      'menu_item_slug_aliases_format_chk',
      sql`${table.alias} ~ '^[a-z0-9][a-z0-9-]*$'`,
    ),
    // RLS: ENABLE + FORCE
  ],
);
```

### Tenants table: add menu_first_published_at column

```ts
// ADD to existing tenants table:
menuFirstPublishedAt: timestamp('menu_first_published_at', { withTimezone: true, mode: 'date' }),
```

## Migration Strategy

### Forward-only approach (no rollback plan needed)

Zero paying customers at Phase 4a execution time. Forward-only migrations acceptable per CONTEXT.md. A `db:reset` is sufficient for local dev recovery.

### Step ordering (critical path)

1. **Migration A** — ADD columns to `menu_items`: `photos JSONB`, BJU fields, `source`, `needs_review`, `source_external_id`. Keep `image_s3_key` for now (backfill step).
2. **Migration B** — Backfill `photos` from `image_s3_key`: `UPDATE menu_items SET photos = jsonb_build_array(jsonb_build_object('s3Key', image_s3_key, 'sortOrder', 0, 'isPrimary', true)) WHERE image_s3_key IS NOT NULL`.
3. **Migration C** — DROP `image_s3_key` column.
4. **Migration D** — ADD `parent_id` to `menu_categories` with nullable composite self-FK.
5. **Migration E** — CREATE `menu_stop_list` table with composite FK + RLS.
6. **Migration F** — RENAME `menu_variants` → `menu_item_sizes`; change `price_delta` column to `price` (data migration: populate `price = base_price + price_delta` via join — or simpler: price = price_delta since all existing items have priceDelta = 0).
7. **Migration G** — RENAME `menu_modifiers` → `menu_modifier_groups`; RENAME `menu_modifier_options.modifier_id` → `modifier_group_id`; RENAME `menu_item_modifiers` → `menu_item_modifier_groups`; UPDATE junction FK column name.
8. **Migration H** — Add `defaultAmount`, `freeAmount` columns to `menu_modifier_options`.
9. **Migration I** — CREATE `menu_item_slug_aliases` table.
10. **Migration J** — ADD `menu_first_published_at` to `tenants` table.
11. **Migration K** — CREATE Postgres sequence `menu_versions_seq` for menu version fallback.
12. **Migration L** — RLS: ENABLE + FORCE on all new tables (`menu_stop_list`, `menu_item_slug_aliases`).

**Riskiest step:** Migration F (size table rename + price semantic change). Existing `menu_variants` rows all have `priceDelta = 0` per seed data — the price column becomes `base_price` copied from the item, or simply remains 0 (meaning "same as base"). Recommend: for MVP-1, keep sizes at priceDelta = 0 semantics (price = item base_price when selected), but store as absolute price. The conversion: `price = item.basePrice + variant.priceDelta`. Since all variants currently have priceDelta = 0, this is `price = item.basePrice`. The repository read path must then return the size's absolute price rather than adding delta.

## Downstream Consumer Inventory (Skeptic HIGH-3)

| Consumer file                                                                | Type                             | Impact                                                                                                                             | Required refactor                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/qr-menu/src/api/types.ts`                                              | Manual DTO type                  | `MenuItemDto.imageUrl: string \| null` stays valid; add optional `photos` array field; `modifiers: readonly unknown[]` needs shape | Add `photos?: readonly MenuPhotoDto[]` to `MenuItemDto`; keep `imageUrl` as convenience projection from `photos[0]`; update `modifiers` type to `MenuModifierGroupDto`                                                            |
| `packages/api-client/src/generated/api.ts`                                   | Auto-generated from openapi.yaml | Full regen needed after openapi.yaml update                                                                                        | Run `pnpm openapi:gen` after D-4a-08 openapi.yaml regen                                                                                                                                                                           |
| `apps/api/test/e2e/catalog.e2e.spec.ts`                                      | E2E spec                         | References `imageS3Key` in POST payload (line 89), `imageUrl` in response assertion (line 116)                                     | Update POST payload to use `photos` array; update GET assertion to read `photos[0].s3Key` presigned URL (not raw key); confirm `imageS3Key` string no longer in response                                                          |
| `apps/api/test/e2e/cross-tenant-isolation.e2e.spec.ts`                       | E2E isolation spec               | Seeds category + item for tenants A/B; new schema columns need presence in seed                                                    | Add `photos: []` default to item seed; new tables (`menu_stop_list`, `menu_item_slug_aliases`, `menu_item_sizes`, `menu_modifier_groups`) must be added to cross-tenant isolation matrix (ADR-0020 I-2 mandate from db/CLAUDE.md) |
| `apps/api/test/e2e/menu-brand-response.e2e.spec.ts`                          | E2E spec                         | References `imageUrl`                                                                                                              | Update to use `photos` projection                                                                                                                                                                                                 |
| `apps/api/src/contexts/audit/application/record-audit.service.ts`            | Audit handler                    | `ACTION_TARGET_KIND` map needs new catalog event prefixes                                                                          | Add: `'catalog.menu_first_published': 'menu'`, `'catalog.menu_republished': 'menu'`, `'catalog.item_stopped': 'menu_item'`, `'catalog.item_unstopped': 'menu_item'`                                                               |
| `apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts` | Drizzle repo                     | 342-line file, all queries reference old table/column names                                                                        | Full refactor: `menuVariants` → `menuItemSizes`, `menuModifiers` → `menuModifierGroups`, `menuItemModifiers` → `menuItemModifierGroups`, `imageS3Key` → `photos`; `signImage(row.imageS3Key)` → `signImages(row.photos)`          |
| `apps/api/src/contexts/catalog/domain/published-menu.ts`                     | Domain read model                | `imageUrl: string \| null` → `photos: readonly MenuItemPhoto[]` + keep `imageUrl` as convenience                                   | Add `photos` array field; keep `imageUrl` as primary photo presigned URL for backward-compat; add BJU + sizes + modifierGroups shape                                                                                              |
| `apps/api/src/contexts/catalog/application/dto.ts`                           | Zod DTOs                         | `imageS3Key` → `photos` array; add BJU fields, `source`, `parentId` on category                                                    | Full schema update                                                                                                                                                                                                                |
| `packages/domain/src/schema/menu-item.ts`                                    | Domain schema                    | `imageS3Key` field                                                                                                                 | Replace with `photos` array type                                                                                                                                                                                                  |
| `packages/events/src/contracts/`                                             | Event contracts                  | `catalog` namespace does not exist yet                                                                                             | Create `packages/events/src/contracts/catalog.ts` with 4 new contracts                                                                                                                                                            |
| `docs/api/openapi.yaml`                                                      | OpenAPI spec                     | All catalog endpoints change shape                                                                                                 | Regen via `pnpm openapi:emit` (D-4a-08)                                                                                                                                                                                           |
| ESLint composite-FK audit (planned `pnpm db:audit-fks`)                      | Lint                             | New tables need to appear in audit allowlist                                                                                       | Add `menu_stop_list`, `menu_item_slug_aliases`, `menu_item_sizes`, `menu_modifier_groups`, `menu_item_modifier_groups` to the expected-tables list when audit rule lands                                                          |

## Open Questions Resolved

### Q1: Hierarchical Группы vs flat categories

**Recommendation: Add `parent_id` column now, keep MVP-1 UI flat.**

Rationale: iiko `Группа` is unambiguously a tree (Python model: `parent_group: Optional[str]`, Go struct: `ParentGroup string`). Adding the `parent_id` nullable self-FK is a 1-column migration with zero data migration cost (all existing rows get NULL). The admin IA in Phase 4b can start flat (single-level tree depth). Phase 5 website and Phase 6 qr-menu can ignore `parentId` until v2 deep tree UI is needed. MVP-3 iiko adapter maps `Группа.parent_group` → `category.parentId` directly.

Downstream cost of NOT adding now: Phase 4b must discuss hierarchical IA, then migrate a customer-data table. If hierarchical IA is the right UX (it is — restaurant menus have "Закуски > Горячие закуски"), the migration happens either in 4a (zero cost) or post-customer (expensive). Do it in 4a.

Alternatives: nested-set (complex queries), materialized-path (string prefix), ltree extension (powerful but extension dependency). **Adjacency-list (`parent_id`)** is correct for MVP-1: simpler to implement, sufficient for ≤3 nesting levels (the practical max for a restaurant menu), and Drizzle queries it with a simple join or two-level load.

### Q2: Размер (size) — standalone entity vs embedded variant

**Recommendation: Keep per-item (not shared/reusable), but rename table and fix price semantics.**

iiko's `NSizeModel` is a global list of sizes (`id`, `name`, `priority`, `is_default`) that products reference via `size_prices`. This enables "share a size definition across all dishes" — e.g., "Small / Medium / Large" sizes defined once, then applied to any product. This is operationally correct for iiko POS (where a chef manages global size definitions).

For RestOS MVP-1, the operator creating their first menu will NOT manage a global sizes library. They will say "this pizza has Small (€8) and Large (€14)". A per-item size table (`menu_item_sizes`) matches this mental model exactly.

**Downstream impact (Phase 7):** The cart_line must store a snapshot of the chosen size. Whether sizes are per-item or global, cart_line carries `{ itemId, sizeId, sizePrice }`. The schema difference is whether `sizeId` references a global `sizes` table or a per-item `menu_item_sizes` row. For Phase 7, the per-item model is simpler: `cart_line.menu_item_size_id → menu_item_sizes(id, tenant_id)`. Document this as Phase 7's dependency.

**MVP-3 iiko adapter complexity:** MEDIUM. The adapter will need to match iiko's global size to RestOS's per-item size by name: "find or create per-item size row matching iiko size name". Not a structural problem.

**Price change:** `price_delta` → absolute `price`. iiko uses absolute price per size (`NPSizePriceModel.price.current_price`). RestOS's current `priceDelta` is non-standard and creates confusion at the order checkout ("what is the base price when multiple sizes exist?"). Absolute price per size is cleaner. Since all current sizes have priceDelta = 0, backfill is trivial.

### Q3: Модификатор vs Группа модификаторов

**Recommendation: Rename `menu_modifiers` → `menu_modifier_groups` — structural change is already correct.**

The current `menu_modifiers` table already models a group (it has `min_selectable`, `max_selectable`, `is_required` which are group-level properties in iiko). The `menu_modifier_options` table already models individual options within the group. The naming mismatch is confusing but the structure is correct.

Work required: rename table + rename FK column in `menu_modifier_options` (`modifier_id` → `modifier_group_id`) + rename junction table (`menu_item_modifiers` → `menu_item_modifier_groups`). All application-layer code (`upsert-modifier.service.ts`, `catalog-drizzle.repository.ts`) follows the rename.

Add `defaultAmount` and `freeAmount` on options to match iiko's `NPModifierModel.default_amount` and `free_of_charge_amount`.

### Q4: ТТК (recipe entity) — full vs structured BJU only

**Recommendation: Ship only BJU columns in 4a. No schema lock-in for v2 ТТК.**

4 nullable decimal columns on `menu_items` (proteins, fats, carbs, kcal) + boolean `nutrition_estimated` is the correct MVP-1 surface. iiko's full ТТК has ingredients list → requires a separate `menu_item_recipe_ingredients` table referencing raw material products. This is a Phase 3+ bounded context concern (cost-of-goods, procurement). A future `menu_item_recipes` table can `REFERENCES menu_items(id, tenant_id)` with no conflict with the 4a schema.

Schema lock-in check: nullable BJU columns on items do NOT prevent adding a separate recipe table later. The bjufields and the full ТТК entity are additive, not conflicting.

### Q5: Стоп-лист shape — table vs column vs Redis

**Recommendation: Separate `menu_stop_list` table.**

Three options analyzed:

| Option                              | Pros                                                                                                                                                                                     | Cons                                                                                                                                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stopped_at` column on `menu_items` | Simple; single row per item                                                                                                                                                              | Conflates stop-list state with item lifecycle; stop/unstop bumps `updated_at` on item; no audit trail per stop event; complex query to exclude stopped items at read time without touching item row |
| `menu_stop_list` table              | Clean separation; audit trail (`stopped_at`, `stopped_by_user_id`, `reason`); multi-replica consistent (DB-backed); query: LEFT JOIN or NOT EXISTS; reason field trivially addable later | One extra table; slightly more complex publish read query                                                                                                                                           |
| Redis runtime flag                  | Fast; no DB; instant consistency across replicas                                                                                                                                         | NOT consistent on Redis restart; loses state on outage; forces "is this item stopped?" check to always hit Redis; no audit trail; breaks the multi-replica consistency invariant                    |

**Winner: separate table.** The key argument (CTO M3): stop-list mutations must NOT bump the menu version — if a stop event changes `menu_items.status`, it invalidates the publish version cache. A separate table means stop-list status is overlaid at read time without touching the canonical item row or the publish version.

The read path change: `loadPublishedMenu` adds a LEFT JOIN (or a separate `selectFrom(schema.menuStopList)`) to identify stopped items, then filters them from the `items` array in the response. This is O(stopped items) per read — negligible for any realistic restaurant menu size.

**Multi-replica consistency:** the table is DB-backed and propagated to all replicas. Redis-only would create a split-brain where a stopped item shows as available on replicas that haven't synced the Redis key yet.

### Q6: Стоп-лист с reason — schema compatibility

**Recommendation: Add `reason TEXT NULLABLE` column in 4a migration.**

iiko supports a reason string on stop-list entries. MVP-1 UI will not expose this field (D-11 from 04-CONTEXT defers it to v2). But adding a nullable `reason TEXT` column in the 4a table creation costs nothing and removes a future migration. The column defaults to NULL; v2 admin UI can add a text input without any schema change.

Same applies to `stopped_by_user_id TEXT NULLABLE` — populate it in Phase 4b when operator auth context is wired through stop-list mutations. The column exists in 4a, gets populated in 4b.

## Phase 7 Ripple Map (CTO M2)

| Phase 4a entity                                                    | Phase 7 impact                                                                                       | Required Phase 7 schema                                                                                                                                                                      |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `menu_item_sizes` (per-item, absolute price)                       | `cart_line` must store chosen size snapshot                                                          | `cart_line.menu_item_size_id UUID NULLABLE` FK + `cart_line.size_name LocalizedText NULLABLE` + `cart_line.size_price numeric(12,2) NULLABLE` for snapshot                                   |
| `menu_modifier_groups` + `menu_modifier_options` (correctly named) | `cart_line` stores modifier choices with group + option references                                   | `cart_line_modifier_choices` junction: `(cart_line_id, modifier_group_id, modifier_option_id, amount, price_delta_snapshot)`                                                                 |
| `menu_stop_list` table                                             | `place_order` service must check stop-list at order creation time (item stopped → reject order line) | Phase 7 order placement must query `menu_stop_list` for each item; alternatively, stop-list check in the catalog `get-published-menu` read path (which already filters `status = published`) |
| `menu_items.source` enum                                           | Future iiko adapter order sync needs to know if item was originally iiko                             | No Phase 7 schema impact; annotation only                                                                                                                                                    |
| `catalog.menu_first_published.v1`                                  | Phase 7 ordering depends on published menu existing                                                  | Order placement should assert tenant has a published menu (has at least one `catalog.menu_first_published.v1` event or `tenants.menu_first_published_at IS NOT NULL`)                        |

## MVP-3 iiko Adapter Complexity Annotation

| Entity                  | Adapter complexity       | Why                                                                                                                                                                                                                      |
| ----------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `menu_categories`       | **Shallow**              | Direct: `Group.id` → `category.id`; `Group.name` → `category.name`; `Group.parent_group` → `category.parentId`; `Group.order` → `category.sortOrder`                                                                     |
| `menu_items`            | **Medium**               | Photos: unpack `image_links[]` → `photos[]` (multiple S3 uploads); BJU: `proteins_amount` → `proteins` etc. (unit conversion check needed); `source = 'imported_iiko'`; `sourceExternalId = iiko.id`                     |
| `menu_item_sizes`       | **Medium**               | `NSizeModel.id` is global in iiko → needs to be materialized per-item; price from `size_prices[i].price.current_price` (absolute, maps correctly)                                                                        |
| `menu_modifier_groups`  | **Shallow**              | `NPGroupModifierModel` fields map 1:1 to `menu_modifier_groups`; `min_amount`, `max_amount`, `required`                                                                                                                  |
| `menu_modifier_options` | **Medium**               | `ChildModifiers` + `NPModifierModel` have `default_amount`, `free_of_charge_amount` → now mapped directly                                                                                                                |
| `menu_stop_list`        | **Deep**                 | iiko stop-list is terminal-group scoped (per POS terminal, not per brand); RestOS stop-list is brand/tenant scoped; adapter must collapse terminal-group stop-lists to the union of stopped items for the relevant brand |
| ТТК                     | **N/A in MVP-3 Phase B** | Full ТТК requires ingredients list + raw material catalog — separate Phase                                                                                                                                               |
