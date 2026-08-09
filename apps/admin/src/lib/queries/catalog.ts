import { apiFetch } from '@/lib/api-client';
import type { Status } from '@/lib/menu/types';
import type { ItemListStatusFilter } from '@/lib/menu/zod-schemas';
import type {
  CategoryForm,
  ItemEditorForm,
  SizeForm,
  ModifierGroupForm,
  ModifierOptionForm,
} from '@/lib/menu/zod-schemas';

const STALE_STABLE = 30_000;
const STALE_DRAFT_DIFF = 10_000;

export interface CategoryListItemApi {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: Record<string, string>;
  readonly sortOrder: number;
  readonly status: Status;
}

export interface CategoryListResponse {
  readonly items: readonly CategoryListItemApi[];
}

export interface ItemListItemApi {
  readonly id: string;
  readonly name: Record<string, string>;
  readonly categoryId: string;
  readonly categoryName: Record<string, string>;
  readonly parentCategoryName: Record<string, string> | null;
  readonly photoUrl: string | null;
  readonly basePrice: string;
  readonly currency: string;
  readonly status: Status;
  readonly hasSizes: boolean;
  readonly stoppedAt: string | null;
}

export interface ItemListResponse {
  readonly items: readonly ItemListItemApi[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface ItemSizeApi {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly isDefault: boolean;
  readonly sortOrder: number;
}

export interface ModifierOptionApi {
  readonly id: string;
  readonly name: string;
  readonly priceDelta: number;
  readonly defaultAmount: number;
  readonly freeAmount: number;
  readonly sortOrder: number;
}

export interface ModifierGroupApi {
  readonly id: string;
  readonly name: string;
  readonly minSelectable: number;
  readonly maxSelectable: number;
  readonly status: Status;
}

export interface ItemDetailApi {
  readonly id: string;
  readonly name: Record<string, string>;
  readonly description: Record<string, string> | null;
  readonly categoryId: string;
  readonly basePrice: string;
  readonly currency: string;
  readonly status: Status;
  readonly allergens: string[];
  readonly ingredients: string[];
  readonly metaTitle: Record<string, string> | null;
  readonly metaDescription: Record<string, string> | null;
  readonly proteins: number | null;
  readonly fats: number | null;
  readonly carbs: number | null;
  readonly kcal: number | null;
  readonly nutritionEstimated: boolean;
  readonly photoUrl: string | null;
  readonly photoS3Key: string | null;
  readonly sizes: readonly ItemSizeApi[];
  readonly modifierGroupIds: readonly string[];
  readonly slug: string;
}

export interface ModifierGroupDetailApi extends ModifierGroupApi {
  readonly options: readonly ModifierOptionApi[];
}

export interface ModifierGroupListResponse {
  readonly items: readonly ModifierGroupApi[];
}

export interface StopListItemApi {
  readonly id: string;
  readonly name: Record<string, string>;
  readonly categoryName: Record<string, string>;
  readonly parentCategoryName: Record<string, string> | null;
  readonly photoUrl: string | null;
  readonly stoppedAt: string;
}

export interface StopListResponse {
  readonly items: readonly StopListItemApi[];
}

export interface AggregateStopListItemApi {
  readonly itemId: string;
  readonly itemName: Record<string, string> | null;
  readonly categoryName: Record<string, string> | null;
  readonly stoppedLocationCount: number;
  readonly lastStoppedAt: string;
}

export interface AggregateStopListResponse {
  readonly items: readonly AggregateStopListItemApi[];
  readonly totalActiveLocations: number;
}

export interface DraftDiffEntryApi {
  readonly entityType: 'item' | 'category' | 'modifier-group';
  readonly id: string;
  readonly name: Record<string, string> | string;
  readonly status: 'draft' | 'modified' | 'archived';
}

export interface DraftDiffResponse {
  readonly unpublishedCount: number;
  readonly truncatedCount: number;
  readonly items: readonly DraftDiffEntryApi[];
}

export interface PhotoUploadUrlResponse {
  readonly url: string;
  readonly s3Key: string;
  readonly expiresAt: string;
}

export interface ItemFilters {
  readonly status?: ItemListStatusFilter;
  readonly categoryId?: string | null;
  readonly q?: string;
  readonly limit?: number;
  readonly offset?: number;
}

const buildItemsQueryString = (filters: ItemFilters): string => {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== 'all-except-archived') {
    params.set('status', filters.status);
  }
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.q) params.set('q', filters.q);
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.offset !== undefined) params.set('offset', String(filters.offset));
  const qs = params.toString();
  return qs ? `/v1/catalog/items?${qs}` : '/v1/catalog/items';
};

export const categoriesQuery = (brandSlug: string) => ({
  queryKey: ['catalog', 'categories', brandSlug] as const,
  queryFn: () => apiFetch<CategoryListResponse>('/v1/catalog/categories', { brandSlug }),
  staleTime: STALE_STABLE,
});

export const itemsQuery = (brandSlug: string, filters: ItemFilters = {}) => ({
  queryKey: ['catalog', 'items', brandSlug, filters] as const,
  queryFn: () => apiFetch<ItemListResponse>(buildItemsQueryString(filters), { brandSlug }),
  staleTime: STALE_STABLE,
});

export const itemQuery = (brandSlug: string, id: string) => ({
  queryKey: ['catalog', 'item', brandSlug, id] as const,
  queryFn: () => apiFetch<ItemDetailApi>(`/v1/catalog/items/${id}`, { brandSlug }),
  staleTime: STALE_STABLE,
});

export const modifierGroupsQuery = (brandSlug: string) => ({
  queryKey: ['catalog', 'modifier-groups', brandSlug] as const,
  queryFn: () => apiFetch<ModifierGroupListResponse>('/v1/catalog/modifier-groups', { brandSlug }),
  staleTime: STALE_STABLE,
});

export const modifierGroupQuery = (brandSlug: string, id: string) => ({
  queryKey: ['catalog', 'modifier-group', brandSlug, id] as const,
  queryFn: () =>
    apiFetch<ModifierGroupDetailApi>(`/v1/catalog/modifier-groups/${id}`, { brandSlug }),
  staleTime: STALE_STABLE,
});

export const stopListQuery = (brandSlug: string, locationId: string) => ({
  queryKey: ['catalog', 'stop-list', brandSlug, locationId] as const,
  queryFn: () => apiFetch<StopListResponse>('/v1/catalog/stop-list', { brandSlug, locationId }),
  staleTime: STALE_STABLE,
});

export const stopListAggregateQuery = (brandSlug: string) => ({
  queryKey: ['catalog', 'stop-list-aggregate', brandSlug] as const,
  queryFn: () =>
    apiFetch<AggregateStopListResponse>('/v1/catalog/stop-list/aggregate', {
      brandSlug,
      locationId: 'all',
    }),
  staleTime: STALE_STABLE,
});

export const draftDiffQuery = (brandSlug: string) => ({
  queryKey: ['catalog', 'draft-diff', brandSlug] as const,
  queryFn: () => apiFetch<DraftDiffResponse>('/v1/catalog/draft-diff', { brandSlug }),
  staleTime: STALE_DRAFT_DIFF,
});

export const upsertCategory = (brandSlug: string, id: string | null, data: CategoryForm) =>
  apiFetch<CategoryListItemApi>('/v1/catalog/categories', {
    method: 'POST',
    body: { ...data, id: id ?? undefined },
    brandSlug,
  });

export const reorderCategories = (
  brandSlug: string,
  moves: { id: string; parentId: string | null; sortOrder: number }[],
) =>
  apiFetch<{ readonly updated: number }>('/v1/catalog/categories/reorder', {
    method: 'POST',
    body: { moves },
    brandSlug,
  });

export const archiveCategory = (brandSlug: string, id: string) =>
  apiFetch(`/v1/catalog/categories/${id}/archive`, {
    method: 'PATCH',
    brandSlug,
  });

export const upsertItem = (
  brandSlug: string,
  id: string | null,
  data: ItemEditorForm & { readonly photoS3Key?: string | null },
) =>
  apiFetch<{ readonly id: string }>('/v1/catalog/items', {
    method: 'POST',
    body: { ...data, id: id ?? undefined },
    brandSlug,
  });

export const archiveItem = (brandSlug: string, id: string) =>
  apiFetch(`/v1/catalog/items/${id}/archive`, {
    method: 'PATCH',
    brandSlug,
  });

export const upsertItemSize = (
  brandSlug: string,
  itemId: string,
  data: SizeForm & { readonly id?: string },
) =>
  apiFetch<ItemSizeApi>('/v1/catalog/item-sizes', {
    method: 'POST',
    body: { ...data, itemId },
    brandSlug,
  });

export const upsertItemModifierGroups = (
  brandSlug: string,
  itemId: string,
  modifierGroupIds: readonly string[],
) =>
  apiFetch(`/v1/catalog/items/${itemId}/modifier-groups`, {
    method: 'PUT',
    body: { modifierGroupIds },
    brandSlug,
  });

// D-05: stop/unstop write endpoints stay location-scoped — locationId is
// required (never 'all') and is the operator's currently selected location.
export const toggleStopList = (
  brandSlug: string,
  itemId: string,
  next: 'paused' | 'published',
  locationId: string,
) => {
  if (next === 'paused') {
    return apiFetch('/v1/catalog/stop-list', {
      method: 'POST',
      body: { itemId },
      brandSlug,
      locationId,
    });
  }
  return apiFetch(`/v1/catalog/stop-list/${itemId}`, {
    method: 'DELETE',
    brandSlug,
    locationId,
  });
};

export const resetStopList = async (
  brandSlug: string,
  locationId: string,
): Promise<{ ok: boolean }> => {
  const res = await apiFetch<StopListResponse>('/v1/catalog/stop-list', { brandSlug, locationId });
  if (!res.ok) return { ok: false };
  for (const item of res.data?.items ?? []) {
    const del = await apiFetch(`/v1/catalog/stop-list/${item.id}`, {
      method: 'DELETE',
      brandSlug,
      locationId,
    });
    if (!del.ok) return { ok: false };
  }
  return { ok: true };
};

export const upsertModifierGroup = (
  brandSlug: string,
  id: string | null,
  data: ModifierGroupForm,
) =>
  apiFetch<ModifierGroupApi>('/v1/catalog/modifier-groups', {
    method: 'POST',
    body: { ...data, id: id ?? undefined },
    brandSlug,
  });

export const upsertModifierOption = (
  brandSlug: string,
  groupId: string,
  data: ModifierOptionForm & { readonly id?: string },
) =>
  apiFetch<ModifierOptionApi>('/v1/catalog/modifier-options', {
    method: 'POST',
    body: { ...data, groupId },
    brandSlug,
  });

export const getPhotoUploadUrl = (brandSlug: string, itemId: string) =>
  apiFetch<PhotoUploadUrlResponse>('/v1/catalog/photo-upload-url', {
    method: 'POST',
    body: { itemId },
    brandSlug,
  });

export const schedulePublish = (brandSlug: string) =>
  apiFetch<{ readonly scheduled: boolean; readonly cancelAfterMs: number }>('/v1/catalog/publish', {
    method: 'POST',
    brandSlug,
  });

export const cancelPublish = (brandSlug: string) =>
  apiFetch<{ readonly cancelled: boolean }>('/v1/catalog/publish', {
    method: 'DELETE',
    brandSlug,
  });
