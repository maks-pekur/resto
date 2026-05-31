import type { TenantId } from '@resto/domain';
import type { MenuItemPhoto } from '@resto/db';
import type { PublishedMenu, PublishedMenuItem } from './published-menu';

/**
 * Catalog repository — read + write surface for menu rows. The write
 * methods accept already-validated DTOs (the application service layer
 * does Zod validation); the repo is a thin Drizzle wrapper.
 */
export interface CatalogRepository {
  loadPublishedMenu(
    tenantId: TenantId,
    version: number,
    brandId?: string | null,
  ): Promise<PublishedMenu>;
  findPublishedItem(itemId: string, brandId?: string | null): Promise<PublishedMenuItem | null>;
  upsertCategory(input: UpsertCategoryRow): Promise<{ id: string }>;
  upsertItem(input: UpsertItemRow): Promise<{ id: string; slugChanged?: { oldSlug: string } }>;
  upsertModifierGroup(input: UpsertModifierGroupRow): Promise<{ id: string }>;
  upsertModifierOption(input: UpsertModifierOptionRow): Promise<{ id: string }>;
  upsertItemSize(input: UpsertItemSizeRow): Promise<{ id: string }>;
  addToStopList(input: StopListInsertRow): Promise<{ id: string; itemSlug: string }>;
  removeFromStopList(input: {
    itemId: string;
  }): Promise<{ removed: boolean; itemSlug: string | null }>;

  // ── Phase 4b D-4b-07 read surface ──
  listCategoriesByParent(parentId: string | null): Promise<CategoryListRow[]>;
  listItems(input: {
    status: ItemStatusFilter;
    categoryId: string | null;
    q: string | null;
    limit: number;
    offset: number;
  }): Promise<{ rows: ItemListRow[]; total: number }>;
  getItemById(id: string): Promise<ItemDetailRow | null>;
  listModifierGroups(): Promise<ModifierGroupListRow[]>;
  getModifierGroupById(id: string): Promise<ModifierGroupDetailRow | null>;
  listStopListWithStoppedAt(): Promise<StopListEntryRow[]>;
  computeDraftDiff(input: { tenantId: TenantId }): Promise<{
    items: DraftDiffEntryRow[];
    totalCount: number;
  }>;

  // ── Phase 4b D-4b-07 archive surface ──
  archiveCategory(id: string): Promise<{ found: boolean }>;
  archiveItem(id: string): Promise<{ found: boolean }>;

  getMenuFirstPublishedAt(tenantId: TenantId): Promise<Date | null>;
  /**
   * Atomically: bump `tenants.menu_first_published_at` to NOW() if it is
   * currently NULL, and append the appropriate outbox event in the same
   * transaction. Returns whether the row was a first-publish or a
   * republish. Called from the publish path (delayed-publish 5s timer
   * callback or the ALS-bound HTTP wrapper). `tenantId` is passed
   * explicitly because the setTimeout callback escapes the ALS frame
   * (ADR-0020 I-6).
   */
  finalizeMenuPublish(input: { tenantId: TenantId; version: number }): Promise<{
    isFirstPublish: boolean;
  }>;
  insertSlugAlias(input: { itemId: string; alias: string }): Promise<void>;
}

export const CATALOG_REPOSITORY = Symbol('CATALOG_REPOSITORY');

/**
 * Tenant-scoped menu version store. Each tenant has a monotonically
 * increasing menu version that cache keys depend on; bumping it on
 * publish busts every cache entry without scanning keys.
 */
export interface MenuVersionPort {
  current(tenantId: TenantId): Promise<number>;
  bump(tenantId: TenantId): Promise<number>;
}

export const MENU_VERSION_PORT = Symbol('MENU_VERSION_PORT');

/**
 * Cache adapter for the public read path. Keyed by `(tenantId, version)`;
 * a publish bumps the version, so old cache entries become unreachable
 * (Redis TTL eventually evicts them).
 *
 * `invalidate` lets non-publish writes (e.g. stop-list toggles) flush the
 * current-version cache entry without bumping the version — see D-4a-10 /
 * RESEARCH.md Pattern 2 Option B.
 */
export interface CatalogCachePort {
  get(tenantId: TenantId, version: number, brandId?: string | null): Promise<PublishedMenu | null>;
  set(menu: PublishedMenu, ttlSeconds: number, brandId?: string | null): Promise<void>;
  invalidate(tenantId: TenantId, version: number, brandId?: string | null): Promise<void>;
}

export const CATALOG_CACHE_PORT = Symbol('CATALOG_CACHE_PORT');

/**
 * Image-URL signing port.
 *
 * Catalog images live in a private S3-compatible bucket (R2 / AWS S3 /
 * MinIO in dev). The public read path MUST NOT leak the raw S3 key —
 * a public bucket would expose every tenant's catalog (including
 * unpublished items) to the world. This port turns a key into a
 * short-lived presigned GET URL the qr-menu can render.
 */
export interface ImageUrlPort {
  presignGet(s3Key: string, ttlSeconds: number): Promise<string>;
  /**
   * Presign a PUT URL the operator's browser uses to direct-upload a photo
   * to the bucket (Phase 4b CAT-03). The signed URL binds Content-Type and
   * Content-Length into the SigV4 signature — the browser MUST send the
   * same headers on PUT or S3 returns 403. Unlike `presignGet`, failures
   * propagate to the caller so the controller can return 5xx and the UI
   * can surface a real error.
   *
   * `ttlSeconds` should be ≤ 300 (5 min) per OWASP V12.
   */
  presignPut(
    s3Key: string,
    contentType: string,
    contentLength: number,
    ttlSeconds: number,
  ): Promise<string>;
}

export const IMAGE_URL_PORT = Symbol('IMAGE_URL_PORT');

// ---- Write DTOs ----

export interface UpsertCategoryRow {
  readonly id?: string;
  readonly tenantId: string;
  readonly brandId?: string | null;
  readonly parentId?: string | null;
  readonly slug: string;
  readonly name: Record<string, string>;
  readonly description: Record<string, string> | null;
  readonly sortOrder: number;
}

export interface UpsertItemRow {
  readonly id?: string;
  readonly tenantId: string;
  readonly brandId?: string | null;
  readonly categoryId: string;
  readonly slug: string;
  readonly name: Record<string, string>;
  readonly description: Record<string, string> | null;
  readonly basePrice: string;
  readonly currency: string;
  readonly photos: readonly MenuItemPhoto[];
  readonly allergens: readonly string[] | null;
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
}

export interface UpsertModifierGroupRow {
  readonly id?: string;
  readonly tenantId: string;
  readonly brandId?: string | null;
  readonly name: Record<string, string>;
  readonly minSelectable: number;
  readonly maxSelectable: number;
  readonly isRequired: boolean;
}

export interface UpsertModifierOptionRow {
  readonly id?: string;
  readonly tenantId: string;
  readonly brandId?: string | null;
  readonly modifierGroupId: string;
  readonly name: Record<string, string>;
  readonly priceDelta: string;
  readonly defaultAmount: number;
  readonly freeAmount: number;
  readonly sortOrder: number;
}

export interface UpsertItemSizeRow {
  readonly id?: string;
  readonly tenantId: string;
  readonly brandId?: string | null;
  readonly menuItemId: string;
  readonly name: Record<string, string>;
  readonly price: string;
  readonly isDefault: boolean;
  readonly sortOrder: number;
}

export interface StopListInsertRow {
  readonly itemId: string;
  readonly tenantId: string;
  readonly brandId?: string | null;
  readonly reason: string | null;
  readonly stoppedByUserId: string | null;
}

// ── Phase 4b D-4b-07 read-surface row types ──

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

export interface DraftDiffEntryRow {
  readonly entityType: 'item' | 'category' | 'modifier-group';
  readonly id: string;
  readonly name: Record<string, string>;
  readonly status: 'draft' | 'modified' | 'archived';
}
