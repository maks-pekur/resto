import type { TenantId } from '@resto/domain';
import type { PublishedMenu, PublishedMenuItem } from './published-menu';

/**
 * Catalog repository — read + write surface for menu rows. The write
 * methods accept already-validated DTOs (the application service layer
 * does Zod validation); the repo is a thin Drizzle wrapper.
 */
export interface CatalogRepository {
  loadPublishedMenu(tenantId: TenantId, version: number): Promise<PublishedMenu>;
  findPublishedItem(itemId: string): Promise<PublishedMenuItem | null>;
  upsertCategory(input: UpsertCategoryRow): Promise<{ id: string }>;
  upsertItem(input: UpsertItemRow): Promise<{ id: string }>;
  upsertModifier(input: UpsertModifierRow): Promise<{ id: string }>;
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
 */
export interface CatalogCachePort {
  get(tenantId: TenantId, version: number): Promise<PublishedMenu | null>;
  set(menu: PublishedMenu, ttlSeconds: number): Promise<void>;
}

export const CATALOG_CACHE_PORT = Symbol('CATALOG_CACHE_PORT');

// ---- Write DTOs ----

export interface UpsertCategoryRow {
  readonly id?: string;
  readonly tenantId: string;
  readonly slug: string;
  readonly name: Record<string, string>;
  readonly description: Record<string, string> | null;
  readonly sortOrder: number;
}

export interface UpsertItemRow {
  readonly id?: string;
  readonly tenantId: string;
  readonly categoryId: string;
  readonly slug: string;
  readonly name: Record<string, string>;
  readonly description: Record<string, string> | null;
  readonly basePrice: string;
  readonly currency: string;
  readonly imageS3Key: string | null;
  readonly allergens: readonly string[] | null;
  readonly status: 'draft' | 'published' | 'archived';
  readonly sortOrder: number;
}

export interface UpsertModifierRow {
  readonly id?: string;
  readonly tenantId: string;
  readonly name: Record<string, string>;
  readonly minSelectable: number;
  readonly maxSelectable: number;
  readonly isRequired: boolean;
}
