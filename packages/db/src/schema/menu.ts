import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { money, type LocalizedText } from './_types';
import { pkUuid, tenantIdColumn, timestampsColumns } from './_columns';
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
    uniqueIndex('menu_categories_tenant_slug_uq').on(table.tenantId, table.slug),
    index('menu_categories_tenant_sort_idx').on(table.tenantId, table.sortOrder),
    check('menu_categories_slug_format_chk', sql`${table.slug} ~ '^[a-z0-9][a-z0-9-]*$'`),
  ],
);

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
    categoryId: uuid('category_id').notNull(),
    slug: text('slug').notNull(),
    name: jsonb('name').$type<LocalizedText>().notNull(),
    description: jsonb('description').$type<LocalizedText>(),
    basePrice: money('base_price').notNull(),
    currency: text('currency').notNull(),
    imageS3Key: text('image_s3_key'),
    /** Allergen tags (e.g. `gluten`, `dairy`, `nuts`). Mandatory for restaurant disclosure. */
    allergens: text('allergens').array(),
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
    foreignKey({
      name: 'menu_items_category_fk',
      columns: [table.categoryId],
      foreignColumns: [menuCategories.id],
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
    foreignKey({
      name: 'menu_variants_item_fk',
      columns: [table.menuItemId],
      foreignColumns: [menuItems.id],
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
    foreignKey({
      name: 'menu_modifier_options_modifier_fk',
      columns: [table.modifierId],
      foreignColumns: [menuModifiers.id],
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
    foreignKey({
      name: 'menu_item_modifiers_item_fk',
      columns: [table.menuItemId],
      foreignColumns: [menuItems.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'menu_item_modifiers_modifier_fk',
      columns: [table.modifierId],
      foreignColumns: [menuModifiers.id],
    }).onDelete('cascade'),
    index('menu_item_modifiers_tenant_item_idx').on(table.tenantId, table.menuItemId),
  ],
);
