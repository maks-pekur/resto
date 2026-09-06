import { sql } from 'drizzle-orm';
import {
  bigint,
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
import { locations } from './locations';

export const menuCategories = pgTable(
  'menu_categories',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    parentId: uuid('parent_id'),
    slug: text('slug').notNull(),
    name: jsonb('name').$type<LocalizedText>().notNull(),
    description: jsonb('description').$type<LocalizedText>(),
    sortOrder: integer('sort_order').notNull().default(0),
    status: text('status').notNull().default('draft'),
    code: text('code'),
    ...timestampsColumns(),
  },
  (table) => [
    foreignKey({
      name: 'menu_categories_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    // ADR-0020 I-2: composite tenant FK on the parent reference.
    foreignKey({
      name: 'menu_categories_parent_fk',
      columns: [table.parentId, table.tenantId],
      foreignColumns: [table.id, table.tenantId],
    }).onDelete('restrict'),
    // NOTE (D-04/plan 04): the second scoping dimension merged into tenant.
    // Slug/code uniqueness is now per-tenant only; this is a deliberate
    // behavior change (two categories with the same slug could previously
    // coexist under two separate scopes of one tenant, no longer possible).
    uniqueIndex('menu_categories_tenant_slug_uq').on(table.tenantId, table.slug),
    uniqueIndex('menu_categories_tenant_code_uq')
      .on(table.tenantId, table.code)
      .where(sql`${table.code} IS NOT NULL`),
    index('menu_categories_tenant_sort_idx').on(table.tenantId, table.sortOrder),
    check('menu_categories_slug_format_chk', sql`${table.slug} ~ '^[a-z0-9][a-z0-9-]*$'`),
    check('menu_categories_status_chk', sql`${table.status} IN ('draft', 'published', 'archived')`),
    tenantParentUniqueIndex('menu_categories', { id: table.id, tenantId: table.tenantId }),
  ],
);

// S3 key is opaque — never a URL — and is presigned at read time by the catalog repository.
export interface MenuItemPhoto {
  s3Key: string;
  sortOrder: number;
  alt?: string;
  width?: number;
  height?: number;
  isPrimary?: boolean;
}

// D-15: an assembled composition line is order-position only — no sortOrder field, no grams/unit/cost.
export interface MenuItemCompositionLine {
  readonly optionId: string;
  readonly removable: boolean;
}

// `status = 'published'` is the only state visible to the public read endpoints.
export const menuItems = pgTable(
  'menu_items',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    categoryId: uuid('category_id').notNull(),
    slug: text('slug').notNull(),
    name: jsonb('name').$type<LocalizedText>().notNull(),
    description: jsonb('description').$type<LocalizedText>(),
    basePrice: money('base_price').notNull(),
    currency: text('currency').notNull(),
    photos: jsonb('photos')
      .$type<MenuItemPhoto[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    allergens: text('allergens').array(),
    /** Vegan, gluten-free and the rest: what the dish *is*, next to what it contains. */
    diets: text('diets').array(),
    composition: text('composition').array(),
    compositionMode: text('composition_mode').notNull().default('text'),
    compositionAssembled: jsonb('composition_assembled')
      .$type<MenuItemCompositionLine[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    metaTitle: text('meta_title'),
    metaDescription: text('meta_description'),
    // Per 100g, all nullable until a recipe lands.
    proteins: numeric('proteins', { precision: 5, scale: 2 }),
    fats: numeric('fats', { precision: 5, scale: 2 }),
    carbs: numeric('carbs', { precision: 5, scale: 2 }),
    kcal: smallint('kcal'),
    source: text('source').notNull().default('manual'),
    needsReview: boolean('needs_review').notNull().default(false),
    sourceExternalId: text('source_external_id'),
    status: text('status').notNull().default('draft'),
    sortOrder: integer('sort_order').notNull().default(0),
    code: text('code'),
    weight: numeric('weight', { precision: 10, scale: 3 }),
    measureUnit: text('measure_unit'),
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
    // NOTE (D-04/plan 04): the second scoping dimension merged into tenant —
    // see menuCategories' note above; same tenant-only uniqueness collapse.
    uniqueIndex('menu_items_tenant_slug_uq').on(table.tenantId, table.slug),
    uniqueIndex('menu_items_tenant_code_uq')
      .on(table.tenantId, table.code)
      .where(sql`${table.code} IS NOT NULL`),
    index('menu_items_tenant_category_status_idx').on(
      table.tenantId,
      table.categoryId,
      table.status,
    ),
    index('menu_items_tenant_status_sort_idx').on(table.tenantId, table.status, table.sortOrder),
    index('menu_items_composition_assembled_gin_idx').using('gin', table.compositionAssembled),
    check('menu_items_status_chk', sql`${table.status} IN ('draft', 'published', 'archived')`),
    check('menu_items_currency_format_chk', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check('menu_items_base_price_nonneg_chk', sql`${table.basePrice}::numeric >= 0`),
    check('menu_items_slug_format_chk', sql`${table.slug} ~ '^[a-z0-9][a-z0-9-]*$'`),
    check(
      'menu_items_source_chk',
      sql`${table.source} IN ('manual', 'ai_generated', 'imported_iiko', 'imported_csv')`,
    ),
    check('menu_items_weight_nonneg_chk', sql`${table.weight} IS NULL OR ${table.weight} >= 0`),
    check(
      'menu_items_measure_unit_chk',
      sql`${table.measureUnit} IS NULL OR ${table.measureUnit} IN ('g','kg','ml','l','pcs')`,
    ),
    check(
      'menu_items_composition_mode_chk',
      sql`${table.compositionMode} IN ('text', 'assembled')`,
    ),
    tenantParentUniqueIndex('menu_items', { id: table.id, tenantId: table.tenantId }),
  ],
);

// `price` is the ABSOLUTE per-size price, not a delta on base (iiko NPSizePriceModel.price.current_price semantics).
// At most one default size per item — enforced by a partial unique index below.
export const menuItemSizes = pgTable(
  'menu_item_sizes',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    menuItemId: uuid('menu_item_id').notNull(),
    name: jsonb('name').$type<LocalizedText>().notNull(),
    price: money('price').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestampsColumns(),
  },
  (table) => [
    foreignKey({
      name: 'menu_item_sizes_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'menu_item_sizes_item_fk',
      child: { id: table.menuItemId, tenantId: table.tenantId },
      parent: { id: menuItems.id, tenantId: menuItems.tenantId },
    }).onDelete('cascade'),
    // NOTE (D-04/plan 04): the second scoping column + its composite FK dropped.
    index('menu_item_sizes_tenant_item_idx').on(table.tenantId, table.menuItemId, table.sortOrder),
    uniqueIndex('menu_item_sizes_one_default_per_item_uq')
      .on(table.menuItemId)
      .where(sql`${table.isDefault} = true`),
    tenantParentUniqueIndex('menu_item_sizes', { id: table.id, tenantId: table.tenantId }),
  ],
);

export const menuModifierGroups = pgTable(
  'menu_modifier_groups',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    name: jsonb('name').$type<LocalizedText>().notNull(),
    display: text('display').notNull().default('tiles'),
    behaviour: text('behaviour').notNull().default('several'),
    isRequired: boolean('is_required').notNull().default(false),
    maxSelectable: smallint('max_selectable'),
    ...timestampsColumns(),
  },
  (table) => [
    foreignKey({
      name: 'menu_modifier_groups_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    // NOTE (D-04/plan 04): the second scoping column + its composite FK dropped.
    check('menu_modifier_groups_display_chk', sql`${table.display} IN ('tiles', 'tabs')`),
    check('menu_modifier_groups_behaviour_chk', sql`${table.behaviour} IN ('one', 'several')`),
    tenantParentUniqueIndex('menu_modifier_groups', { id: table.id, tenantId: table.tenantId }),
  ],
);

// `priceDelta` is added to the item base price when selected.
// `defaultAmount` / `freeAmount` mirror iiko NPModifierModel.{default_amount,free_of_charge_amount}.
// D-01/D-03: an option (ingredient) is a tenant-level entity with its own identity and price —
// it belongs to no group; membership lives in the two link tables below.
export const menuModifierOptions = pgTable(
  'menu_modifier_options',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    name: jsonb('name').$type<LocalizedText>().notNull(),
    description: jsonb('description').$type<LocalizedText>(),
    imageS3Key: text('image_s3_key'),
    priceDelta: money('price_delta').notNull().default('0'),
    defaultAmount: smallint('default_amount').notNull().default(0),
    freeAmount: smallint('free_amount').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    minAmount: smallint('min_amount'),
    maxAmount: smallint('max_amount'),
    source: text('source').notNull().default('manual'),
    sourceExternalId: text('source_external_id'),
    ...timestampsColumns(),
  },
  (table) => [
    foreignKey({
      name: 'menu_modifier_options_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    // NOTE (D-04/plan 04): the second scoping column + its composite FK dropped.
    index('menu_modifier_options_tenant_sort_idx').on(table.tenantId, table.sortOrder),
    check(
      'menu_modifier_options_amount_nonneg_chk',
      sql`${table.minAmount} IS NULL OR ${table.minAmount} >= 0`,
    ),
    check(
      'menu_modifier_options_amount_order_chk',
      sql`${table.minAmount} IS NULL OR ${table.maxAmount} IS NULL OR ${table.maxAmount} >= ${table.minAmount}`,
    ),
    check(
      'menu_modifier_options_source_chk',
      sql`${table.source} IN ('manual', 'ai_generated', 'imported_iiko', 'imported_csv')`,
    ),
    tenantParentUniqueIndex('menu_modifier_options', { id: table.id, tenantId: table.tenantId }),
  ],
);

export const menuItemModifierGroups = pgTable(
  'menu_item_modifier_groups',
  {
    tenantId: tenantIdColumn(),
    menuItemId: uuid('menu_item_id').notNull(),
    modifierGroupId: uuid('modifier_group_id').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    primaryKey({
      name: 'menu_item_modifier_groups_pk',
      columns: [table.menuItemId, table.modifierGroupId],
    }),
    foreignKey({
      name: 'menu_item_modifier_groups_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'menu_item_modifier_groups_item_fk',
      child: { id: table.menuItemId, tenantId: table.tenantId },
      parent: { id: menuItems.id, tenantId: menuItems.tenantId },
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'menu_item_modifier_groups_group_fk',
      child: { id: table.modifierGroupId, tenantId: table.tenantId },
      parent: { id: menuModifierGroups.id, tenantId: menuModifierGroups.tenantId },
    }).onDelete('cascade'),
    // NOTE (D-04/plan 04): the second scoping column + its composite FK dropped.
    index('menu_item_modifier_groups_tenant_item_idx').on(table.tenantId, table.menuItemId),
  ],
);

// D-02/D-32: group→ingredient membership, no behavioural column beyond sortOrder.
export const menuModifierGroupOptions = pgTable(
  'menu_modifier_group_options',
  {
    tenantId: tenantIdColumn(),
    modifierGroupId: uuid('modifier_group_id').notNull(),
    optionId: uuid('option_id').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isDefault: boolean('is_default').notNull().default(false),
  },
  (table) => [
    primaryKey({
      name: 'menu_modifier_group_options_pk',
      columns: [table.modifierGroupId, table.optionId],
    }),
    foreignKey({
      name: 'menu_modifier_group_options_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'menu_modifier_group_options_group_fk',
      child: { id: table.modifierGroupId, tenantId: table.tenantId },
      parent: { id: menuModifierGroups.id, tenantId: menuModifierGroups.tenantId },
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'menu_modifier_group_options_option_fk',
      child: { id: table.optionId, tenantId: table.tenantId },
      parent: { id: menuModifierOptions.id, tenantId: menuModifierOptions.tenantId },
    }).onDelete('cascade'),
    index('menu_modifier_group_options_tenant_group_idx').on(
      table.tenantId,
      table.modifierGroupId,
      table.sortOrder,
    ),
  ],
);

// D-02/D-32: dish→ingredient direct membership (a dish's single ingredients, outside any group).
export const menuItemModifierOptions = pgTable(
  'menu_item_modifier_options',
  {
    tenantId: tenantIdColumn(),
    menuItemId: uuid('menu_item_id').notNull(),
    optionId: uuid('option_id').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    primaryKey({
      name: 'menu_item_modifier_options_pk',
      columns: [table.menuItemId, table.optionId],
    }),
    foreignKey({
      name: 'menu_item_modifier_options_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'menu_item_modifier_options_item_fk',
      child: { id: table.menuItemId, tenantId: table.tenantId },
      parent: { id: menuItems.id, tenantId: menuItems.tenantId },
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'menu_item_modifier_options_option_fk',
      child: { id: table.optionId, tenantId: table.tenantId },
      parent: { id: menuModifierOptions.id, tenantId: menuModifierOptions.tenantId },
    }).onDelete('cascade'),
    index('menu_item_modifier_options_tenant_item_idx').on(
      table.tenantId,
      table.menuItemId,
      table.sortOrder,
    ),
  ],
);

// D-20/D-21: ingredient-level stop list, mirrors menuStopList's location-scoped shape.
export const menuOptionStopList = pgTable(
  'menu_option_stop_list',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    locationId: uuid('location_id').notNull(),
    optionId: uuid('option_id').notNull(),
    stoppedAt: timestamp('stopped_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    reason: text('reason'),
    stoppedByUserId: text('stopped_by_user_id'),
  },
  (table) => [
    foreignKey({
      name: 'menu_option_stop_list_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'menu_option_stop_list_option_fk',
      child: { id: table.optionId, tenantId: table.tenantId },
      parent: { id: menuModifierOptions.id, tenantId: menuModifierOptions.tenantId },
    }).onDelete('cascade'),
    compositeTenantFk({
      name: 'menu_option_stop_list_location_fk',
      child: { id: table.locationId, tenantId: table.tenantId },
      parent: { id: locations.id, tenantId: locations.tenantId },
    }).onDelete('restrict'),
    uniqueIndex('menu_option_stop_list_location_option_tenant_uq').on(
      table.tenantId,
      table.locationId,
      table.optionId,
    ),
    tenantParentUniqueIndex('menu_option_stop_list', { id: table.id, tenantId: table.tenantId }),
  ],
);

// D-4a-10: stop-list overlay is a separate table to keep the audit trail and stay multi-replica consistent.
// Read-time filtering happens in `loadPublishedMenu`.
export const menuStopList = pgTable(
  'menu_stop_list',
  {
    id: pkUuid(),
    tenantId: tenantIdColumn(),
    locationId: uuid('location_id').notNull(),
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
    compositeTenantFk({
      name: 'menu_stop_list_location_fk',
      child: { id: table.locationId, tenantId: table.tenantId },
      parent: { id: locations.id, tenantId: locations.tenantId },
    }).onDelete('restrict'),
    uniqueIndex('menu_stop_list_location_item_tenant_uq').on(
      table.tenantId,
      table.locationId,
      table.itemId,
    ),
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

export const catalogMenuVersion = pgTable(
  'catalog_menu_version',
  {
    tenantId: uuid('tenant_id').primaryKey(),
    menuVersion: bigint('menu_version', { mode: 'number' }).notNull().default(1),
  },
  (table) => [
    foreignKey({
      name: 'catalog_menu_version_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }),
  ],
);

export const catalogLocationStopVersion = pgTable(
  'catalog_location_stop_version',
  {
    locationId: uuid('location_id').notNull(),
    tenantId: tenantIdColumn(),
    stopVersion: bigint('stop_version', { mode: 'number' }).notNull().default(1),
  },
  (table) => [
    primaryKey({
      name: 'catalog_location_stop_version_pk',
      columns: [table.locationId, table.tenantId],
    }),
    foreignKey({
      name: 'catalog_location_stop_version_tenant_fk',
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }),
    compositeTenantFk({
      name: 'catalog_location_stop_version_location_fk',
      child: { id: table.locationId, tenantId: table.tenantId },
      parent: { id: locations.id, tenantId: locations.tenantId },
    }).onDelete('restrict'),
  ],
);
