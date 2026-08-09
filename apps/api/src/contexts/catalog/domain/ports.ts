import type { TenantId } from '@resto/domain';
import type { MenuItemPhoto } from '@resto/db';
import type { PublishedMenu, PublishedMenuItem } from './published-menu';

export interface CatalogRepository {
  loadPublishedMenu(tenantId: TenantId, version: number, brandId: string): Promise<PublishedMenu>;
  findPublishedItem(itemId: string, brandId: string): Promise<PublishedMenuItem | null>;
  upsertCategory(input: UpsertCategoryRow): Promise<{ id: string }>;
  upsertItem(input: UpsertItemRow): Promise<{ id: string; slugChanged?: { oldSlug: string } }>;
  upsertModifierGroup(input: UpsertModifierGroupRow): Promise<{ id: string }>;
  upsertModifierOption(input: UpsertModifierOptionRow): Promise<{ id: string }>;
  upsertItemSize(input: UpsertItemSizeRow): Promise<{ id: string }>;
  replaceItemModifierGroups(input: {
    itemId: string;
    brandId: string;
    modifierGroupIds: readonly string[];
  }): Promise<{ id: string }>;
  addToStopList(input: StopListInsertRow): Promise<{ id: string; itemSlug: string }>;
  removeFromStopList(input: {
    itemId: string;
    locationId: string;
  }): Promise<{ removed: boolean; itemSlug: string | null }>;

  listCategoriesByParent(parentId: string | null | undefined): Promise<CategoryListRow[]>;
  listItems(input: {
    status: ItemStatusFilter;
    categoryId: string | null;
    q: string | null;
    limit: number;
    offset: number;
  }): Promise<{ rows: ItemListRow[]; total: number }>;
  getItemById(id: string): Promise<ItemDetailRow | null>;
  listModifierGroups(brandId: string): Promise<ModifierGroupListRow[]>;
  getModifierGroupById(id: string): Promise<ModifierGroupDetailRow | null>;
  listStopListWithStoppedAt(locationId: string): Promise<StopListEntryRow[]>;
  listStoppedItemIds(locationId: string): Promise<string[]>;
  listStopListAggregateAcrossLocations(
    tenantId: TenantId,
    activeLocationIds: readonly string[],
  ): Promise<AggregateStopListRow[]>;
  computeDraftDiff(input: { tenantId: TenantId; brandId: string }): Promise<{
    items: DraftDiffEntryRow[];
    totalCount: number;
  }>;

  archiveCategory(id: string, brandId: string): Promise<{ found: boolean }>;
  archiveItem(id: string, brandId: string): Promise<{ found: boolean }>;

  applyCategoryMoves(input: {
    brandId: string;
    moves: readonly { id: string; parentId: string | null; sortOrder: number }[];
  }): Promise<{ updated: number }>;

  getMenuFirstPublishedAt(tenantId: TenantId): Promise<Date | null>;
  finalizeMenuPublish(input: { tenantId: TenantId }): Promise<{
    isFirstPublish: boolean;
    version: number;
  }>;
  insertSlugAlias(input: { itemId: string; alias: string }): Promise<void>;
}

export const CATALOG_REPOSITORY = Symbol('CATALOG_REPOSITORY');

export interface MenuVersionPort {
  current(tenantId: TenantId): Promise<number>;
}

export const MENU_VERSION_PORT = Symbol('MENU_VERSION_PORT');

export interface StopVersionPort {
  currentStop(locationId: string): Promise<number>;
}

export const STOP_VERSION_PORT = Symbol('STOP_VERSION_PORT');

// Bucket is private — public read path must never leak the raw S3 key; this port turns a key into a short-lived presigned URL.
export interface ImageUrlPort {
  presignGet(s3Key: string, ttlSeconds: number): Promise<string>;
  // SigV4 binds Content-Type and Content-Length: browser must send the same headers or S3 returns 403. ttlSeconds ≤ 300 (OWASP V12).
  presignPut(
    s3Key: string,
    contentType: string,
    contentLength: number,
    ttlSeconds: number,
  ): Promise<string>;
}

export const IMAGE_URL_PORT = Symbol('IMAGE_URL_PORT');

export interface UpsertCategoryRow {
  readonly id?: string;
  readonly tenantId: string;
  readonly brandId: string;
  readonly parentId?: string | null;
  readonly slug: string;
  readonly name: Record<string, string>;
  readonly description: Record<string, string> | null;
  readonly sortOrder: number;
  readonly code: string | null;
}

export interface UpsertItemRow {
  readonly id?: string;
  readonly tenantId: string;
  readonly brandId: string;
  readonly categoryId: string;
  readonly slug: string;
  readonly name: Record<string, string>;
  readonly description: Record<string, string> | null;
  readonly basePrice: string;
  readonly currency: string;
  readonly photos: readonly MenuItemPhoto[];
  readonly allergens: readonly string[] | null;
  readonly ingredients: readonly string[] | null;
  readonly metaTitle: string | null;
  readonly metaDescription: string | null;
  readonly proteins: number | null;
  readonly fats: number | null;
  readonly carbs: number | null;
  readonly kcal: number | null;
  readonly nutritionEstimated: boolean;
  readonly source: 'manual' | 'ai_generated' | 'imported_iiko' | 'imported_csv';
  readonly needsReview: boolean;
  readonly sourceExternalId: string | null;
  readonly status: 'draft' | 'published' | 'archived';
  readonly sortOrder: number;
  readonly code: string | null;
  readonly weight: number | null;
  readonly measureUnit: 'g' | 'kg' | 'ml' | 'l' | 'pcs' | null;
}

export interface UpsertModifierGroupRow {
  readonly id?: string;
  readonly tenantId: string;
  readonly brandId: string;
  readonly name: Record<string, string>;
  readonly minSelectable: number;
  readonly maxSelectable: number;
  readonly isRequired: boolean;
}

export interface UpsertModifierOptionRow {
  readonly id?: string;
  readonly tenantId: string;
  readonly brandId: string;
  readonly modifierGroupId: string;
  readonly name: Record<string, string>;
  readonly priceDelta: string;
  readonly defaultAmount: number;
  readonly freeAmount: number;
  readonly sortOrder: number;
  readonly minAmount: number | null;
  readonly maxAmount: number | null;
}

export interface UpsertItemSizeRow {
  readonly id?: string;
  readonly tenantId: string;
  readonly brandId: string;
  readonly menuItemId: string;
  readonly name: Record<string, string>;
  readonly price: string;
  readonly isDefault: boolean;
  readonly sortOrder: number;
}

export interface StopListInsertRow {
  readonly itemId: string;
  readonly tenantId: string;
  readonly locationId: string;
  readonly reason: string | null;
  readonly stoppedByUserId: string | null;
}

export type ItemStatusFilter = 'all' | 'draft' | 'published' | 'archived' | 'active';

export interface CategoryListRow {
  readonly id: string;
  readonly parentId: string | null;
  readonly slug: string;
  readonly name: Record<string, string>;
  readonly description: Record<string, string> | null;
  readonly sortOrder: number;
  readonly status: 'draft' | 'published' | 'archived';
}

export interface ItemListRow {
  readonly id: string;
  readonly slug: string;
  readonly name: Record<string, string>;
  readonly categoryId: string;
  readonly categoryName: Record<string, string> | null;
  readonly parentCategoryName: Record<string, string> | null;
  readonly photo: { s3Key: string; sortOrder: number } | null;
  readonly basePrice: string;
  readonly currency: string;
  readonly status: 'draft' | 'published' | 'archived';
  readonly hasSizes: boolean;
  readonly stoppedAt: string | null;
  readonly sortOrder: number;
}

export interface ItemDetailRow {
  readonly id: string;
  readonly categoryId: string;
  readonly slug: string;
  readonly name: Record<string, string>;
  readonly description: Record<string, string> | null;
  readonly basePrice: string;
  readonly currency: string;
  readonly photos: readonly {
    s3Key: string;
    sortOrder: number;
    alt?: string;
    width?: number;
    height?: number;
    isPrimary?: boolean;
  }[];
  readonly allergens: readonly string[] | null;
  readonly ingredients: readonly string[] | null;
  readonly metaTitle: string | null;
  readonly metaDescription: string | null;
  readonly proteins: number | null;
  readonly fats: number | null;
  readonly carbs: number | null;
  readonly kcal: number | null;
  readonly nutritionEstimated: boolean;
  readonly source: 'manual' | 'ai_generated' | 'imported_iiko' | 'imported_csv';
  readonly needsReview: boolean;
  readonly sourceExternalId: string | null;
  readonly status: 'draft' | 'published' | 'archived';
  readonly sortOrder: number;
  readonly sizes: readonly {
    id: string;
    name: Record<string, string>;
    price: string;
    isDefault: boolean;
    sortOrder: number;
  }[];
  readonly modifierGroupIds: readonly string[];
}

export interface ModifierGroupListRow {
  readonly id: string;
  readonly name: Record<string, string>;
  readonly minSelectable: number;
  readonly maxSelectable: number;
  readonly isRequired: boolean;
  readonly optionCount: number;
  readonly usageCount: number;
}

export interface ModifierGroupDetailRow {
  readonly id: string;
  readonly name: Record<string, string>;
  readonly minSelectable: number;
  readonly maxSelectable: number;
  readonly isRequired: boolean;
  readonly options: readonly {
    id: string;
    name: Record<string, string>;
    priceDelta: string;
    defaultAmount: number;
    freeAmount: number;
    sortOrder: number;
  }[];
}

export interface StopListEntryRow {
  readonly id: string;
  readonly itemId: string;
  readonly itemName: Record<string, string> | null;
  readonly categoryName: Record<string, string> | null;
  readonly stoppedAt: string;
  readonly reason: string | null;
}

// D-05: aggregate is read-only across locations; per-location `reason` values
// can differ, so it is not surfaced here (unlike StopListEntryRow).
export interface AggregateStopListRow {
  readonly itemId: string;
  readonly itemName: Record<string, string> | null;
  readonly categoryName: Record<string, string> | null;
  readonly stoppedLocationCount: number;
  readonly lastStoppedAt: string;
}

export interface DraftDiffEntryRow {
  readonly entityType: 'item' | 'category' | 'modifier-group';
  readonly id: string;
  readonly name: Record<string, string>;
  readonly status: 'draft' | 'modified' | 'archived';
}
