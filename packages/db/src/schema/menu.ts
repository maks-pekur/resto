import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { money, type LocalizedText } from './_types';
import {
  compositeTenantFk,
  pkUuid,
  tenantIdColumn,
  tenantParentUniqueIndex,
  timestampsColumns,
} from './_columns';
import { tenants } from './tenants';

/**
 * Menu category — a grouping of items, e.g. "Pizza", "Drinks".
 *
 * Naming is stored as `LocalizedText` (`{ en: ..., ru: ... }`) so the
 * qr-menu can render in whichever locale the customer's device negotiates.
 */
export const menuCategories = pgTable(
  'menu_categories',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    brandId: uuid('brand_id'),
    parentId: uuid('parent_id'),
    slug: text('slug').notNull(),
    name: jsonb('name').$type<LocalizedText>().notNull(),
    description: jsonb('description').$type<LocalizedText>(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestampsColumns(),
  },
  (table) => [
    foreignKey({
      name: 'menu_categories_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    // D-4a-01 iiko `Группа.parent_group` tree alignment. ADR-0020 I-2: composite tenant FK.
    foreignKey({
      name: 'menu_categories_parent_fk',
      columns: [table.parentId, table.tenantId],
      foreignColumns: [table.id, table.tenantId],
    }).onDelete('restrict'),
    uniqueIndex('menu_categories_tenant_slug_uq').on(table.tenantId, table.slug),
    index('menu_categories_tenant_sort_idx').on(table.tenantId, table.sortOrder),
    check('menu_categories_slug_format_chk', sql`${table.slug} ~ '^[a-z0-9][a-z0-9-]*$'`),
    tenantParentUniqueIndex('menu_categories', { id: table.id, tenantId: table.tenantId }),
  ],
);

/**
 * Photo attached to a menu item. Stored as a JSONB array on
 * `menu_items.photos` (D-4a-02). The S3 key is opaque — never a URL — and
 * gets converted to a presigned GET URL at read time by the catalog
 * repository.
 */
export interface MenuItemPhoto {
  s3Key: string;
  sortOrder: number;
  alt?: string;
  width?: number;
  height?: number;
  isPrimary?: boolean;
}

/**
 * Menu item — a single sellable unit (with potential variants and
 * modifiers attached). `status = 'published'` is the only state visible to
 * the public read endpoints.
 */
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
    /** D-4a-02: photos JSONB array supersedes the single `image_s3_key` column. */
    photos: jsonb('photos')
      .$type<MenuItemPhoto[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Allergen tags (e.g. `gluten`, `dairy`, `nuts`). Mandatory for restaurant disclosure. */
    allergens: text('allergens').array(),
    // D-4a-03: structured БЖУ (per 100 g, all nullable until a recipe lands).
    proteins: numeric('proteins', { precision: 5, scale: 2 }),
    fats: numeric('fats', { precision: 5, scale: 2 }),
    carbs: numeric('carbs', { precision: 5, scale: 2 }),
    kcal: smallint('kcal'),
    nutritionEstimated: boolean('nutrition_estimated').notNull().default(false),
    // D-4a-01: provenance — how this item came into the catalog.
    source: text('source').notNull().default('manual'),
    needsReview: boolean('needs_review').notNull().default(false),
    sourceExternalId: text('source_external_id'),
    status: text('status').notNull().default('draft'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestampsColumns(),
  },
  (table) => [
    foreignKey({
      name: 'menu_items_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'menu_items_category_fk',
      child: { id: table.categoryId, tenantId: table.tenantId },
      parent: { id: menuCategories.id, tenantId: menuCategories.tenantId },
    }).onDelete('restrict'),
    uniqueIndex('menu_items_tenant_slug_uq').on(table.tenantId, table.slug),
    index('menu_items_tenant_category_status_idx').on(
      table.tenantId,
      table.categoryId,
      table.status,
    ),
    index('menu_items_tenant_status_sort_idx').on(table.tenantId, table.status, table.sortOrder),
    check('menu_items_status_chk', sql`${table.status} IN ('draft', 'published', 'archived')`),
    check('menu_items_currency_format_chk', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check('menu_items_base_price_nonneg_chk', sql`${table.basePrice}::numeric >= 0`),
    check('menu_items_slug_format_chk', sql`${table.slug} ~ '^[a-z0-9][a-z0-9-]*$'`),
    check(
      'menu_items_source_chk',
      sql`${table.source} IN ('manual', 'ai_generated', 'imported_iiko', 'imported_csv')`,
    ),
    tenantParentUniqueIndex('menu_items', { id: table.id, tenantId: table.tenantId }),
  ],
);

/**
 * Variant of a menu item: e.g. "Small / Medium / Large", "330ml / 500ml".
 *
 * `priceDelta` is added to the item `basePrice` when this variant is
 * chosen. Each item must have at most one default variant; we enforce
 * that with a partial unique index.
 */
export const menuVariants = pgTable(
  'menu_variants',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    brandId: uuid('brand_id'),
    menuItemId: uuid('menu_item_id').notNull(),
    name: jsonb('name').$type<LocalizedText>().notNull(),
    priceDelta: money('price_delta').notNull().default('0'),
    isDefault: boolean('is_default').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestampsColumns(),
  },
  (table) => [
    foreignKey({
      name: 'menu_variants_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'menu_variants_item_fk',
      child: { id: table.menuItemId, tenantId: table.tenantId },
      parent: { id: menuItems.id, tenantId: menuItems.tenantId },
    }).onDelete('cascade'),
    index('menu_variants_tenant_item_idx').on(table.tenantId, table.menuItemId, table.sortOrder),
    uniqueIndex('menu_variants_one_default_per_item_uq')
      .on(table.menuItemId)
      .where(sql`${table.isDefault} = true`),
  ],
);

/**
 * Modifier group (e.g. "Toppings", "Sauce", "Spice level"). Constrains
 * how many options a customer can pick at order time via
 * `min_selectable` and `max_selectable`.
 */
export const menuModifiers = pgTable(
  'menu_modifiers',
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
    foreignKey({
      name: 'menu_modifiers_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    check(
      'menu_modifiers_selectable_range_chk',
      sql`${table.minSelectable} >= 0 AND ${table.maxSelectable} >= ${table.minSelectable}`,
    ),
    tenantParentUniqueIndex('menu_modifiers', { id: table.id, tenantId: table.tenantId }),
  ],
);

/**
 * One option within a modifier group (e.g. "Mozzarella" under "Toppings").
 * `priceDelta` is added to the item base price when selected.
 */
export const menuModifierOptions = pgTable(
  'menu_modifier_options',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    brandId: uuid('brand_id'),
    modifierId: uuid('modifier_id').notNull(),
    name: jsonb('name').$type<LocalizedText>().notNull(),
    priceDelta: money('price_delta').notNull().default('0'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestampsColumns(),
  },
  (table) => [
    foreignKey({
      name: 'menu_modifier_options_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'menu_modifier_options_modifier_fk',
      child: { id: table.modifierId, tenantId: table.tenantId },
      parent: { id: menuModifiers.id, tenantId: menuModifiers.tenantId },
    }).onDelete('cascade'),
    index('menu_modifier_options_tenant_modifier_idx').on(
      table.tenantId,
      table.modifierId,
      table.sortOrder,
    ),
  ],
);

/**
 * Junction: which modifier groups apply to which item, with item-local
 * sort order on the menu UI.
 */
export const menuItemModifiers = pgTable(
  'menu_item_modifiers',
  {
    tenantId: tenantIdColumn(),
    brandId: uuid('brand_id'),
    menuItemId: uuid('menu_item_id').notNull(),
    modifierId: uuid('modifier_id').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    primaryKey({
      name: 'menu_item_modifiers_pk',
      columns: [table.menuItemId, table.modifierId],
    }),
    foreignKey({
      name: 'menu_item_modifiers_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'menu_item_modifiers_item_fk',
      child: { id: table.menuItemId, tenantId: table.tenantId },
      parent: { id: menuItems.id, tenantId: menuItems.tenantId },
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'menu_item_modifiers_modifier_fk',
      child: { id: table.modifierId, tenantId: table.tenantId },
      parent: { id: menuModifiers.id, tenantId: menuModifiers.tenantId },
    }).onDelete('cascade'),
    index('menu_item_modifiers_tenant_item_idx').on(table.tenantId, table.menuItemId),
  ],
);

/**
 * D-4a-10: stop-list overlay. Separate table (researcher recommendation in
 * SCHEMA-MAP §Q5) — keeps audit trail (`stopped_at`, `stopped_by_user_id`,
 * `reason`) without bloating `menu_items` and stays multi-replica consistent.
 * Read-time filtering wires in plan 06 inside `loadPublishedMenu`.
 */
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
    reason: text('reason'),
    stoppedByUserId: text('stopped_by_user_id'),
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
    uniqueIndex('menu_stop_list_item_tenant_uq').on(table.tenantId, table.itemId),
    tenantParentUniqueIndex('menu_stop_list', { id: table.id, tenantId: table.tenantId }),
  ],
);

/**
 * D-4a-04: historical slug → item lookup for SEO / 301 redirects when a
 * menu item's primary slug changes. Plan 06 wires alias insertion inside
 * `upsert-item.service.ts`. CHECK matches the URL-safe slug regex used
 * by `menu_items.slug`.
 */
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
    uniqueIndex('menu_item_slug_aliases_tenant_alias_uq').on(table.tenantId, table.alias),
    tenantParentUniqueIndex('menu_item_slug_aliases', {
      id: table.id,
      tenantId: table.tenantId,
    }),
    check('menu_item_slug_aliases_format_chk', sql`${table.alias} ~ '^[a-z0-9][a-z0-9-]*$'`),
  ],
);
