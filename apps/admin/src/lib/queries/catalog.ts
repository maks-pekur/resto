import type { components } from '@resto/api-client';

// Catalog response shapes are DERIVED from the committed OpenAPI contract, never
// re-declared by hand. A hand-written copy silently drifted in five fields and
// crashed the item editor on the api's real `allergens: null`; deriving makes any
// future drift a compile error instead.
type Schemas = components['schemas'];
import { apiFetch } from '@/lib/api-client';
import type { LocalizedText } from '@/lib/menu/localized';
import type { ItemListStatusFilter } from '@/lib/menu/zod-schemas';
import type {
  CategoryForm,
  ItemEditorForm,
  SizeForm,
  ModifierGroupForm,
  ModifierOptionForm,
  IngredientForm,
} from '@/lib/menu/zod-schemas';

const STALE_STABLE = 30_000;
const STALE_DRAFT_DIFF = 10_000;

export type CategoryListItemApi = Schemas['CategoryListResponseDto']['items'][number];

export interface CategoryListResponse {
  readonly items: readonly CategoryListItemApi[];
}

export type ItemListItemApi = Schemas['ItemListResponseDto']['items'][number];

export interface ItemListResponse {
  readonly items: readonly ItemListItemApi[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export type ItemSizeApi = Schemas['ItemDetailResponseDto']['sizes'][number];

export type ModifierOptionApi = Schemas['ModifierGroupDetailResponseDto']['options'][number];
export type ModifierGroupApi = Schemas['ModifierGroupListResponseDto']['items'][number];

export type ItemDetailApi = Schemas['ItemDetailResponseDto'];

export interface ModifierGroupDetailApi extends ModifierGroupApi {
  readonly options: readonly ModifierOptionApi[];
}

export interface ModifierGroupListResponse {
  readonly items: readonly ModifierGroupApi[];
}

export type StopListItemApi = Schemas['StopListResponseDto']['items'][number];

export interface StopListResponse {
  readonly items: readonly StopListItemApi[];
}

export type IngredientApi = Schemas['ModifierOptionListResponseDto']['items'][number];

export interface IngredientListResponse {
  readonly items: readonly IngredientApi[];
}

export type IngredientUsageApi = Schemas['ModifierOptionUsageResponseDto'];

export type OptionStopListItemApi = Schemas['OptionStopListResponseDto']['items'][number];

export interface OptionStopListResponse {
  readonly items: readonly OptionStopListItemApi[];
}

export type IdResponseApi = Schemas['IdResponseDto'];

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
  readonly totalStoppedItems: number;
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
  readonly uploadUrl: string;
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

export const categoriesQuery = () => ({
  queryKey: ['catalog', 'categories'] as const,
  queryFn: () => apiFetch<CategoryListResponse>('/v1/catalog/categories'),
  staleTime: STALE_STABLE,
});

export const itemsQuery = (filters: ItemFilters = {}) => ({
  queryKey: ['catalog', 'items', filters] as const,
  queryFn: () => apiFetch<ItemListResponse>(buildItemsQueryString(filters)),
  staleTime: STALE_STABLE,
});

export const itemQuery = (id: string) => ({
  queryKey: ['catalog', 'item', id] as const,
  queryFn: () => apiFetch<ItemDetailApi>(`/v1/catalog/items/${id}`),
  staleTime: STALE_STABLE,
});

export const modifierGroupsQuery = () => ({
  queryKey: ['catalog', 'modifier-groups'] as const,
  queryFn: () => apiFetch<ModifierGroupListResponse>('/v1/catalog/modifier-groups'),
  staleTime: STALE_STABLE,
});

export const modifierGroupQuery = (id: string) => ({
  queryKey: ['catalog', 'modifier-group', id] as const,
  queryFn: () => apiFetch<ModifierGroupDetailApi>(`/v1/catalog/modifier-groups/${id}`),
  staleTime: STALE_STABLE,
});

export const ingredientsQuery = () => ({
  queryKey: ['catalog', 'ingredients'] as const,
  queryFn: () => apiFetch<IngredientListResponse>('/v1/catalog/modifier-options'),
  staleTime: STALE_STABLE,
});

export const ingredientUsageQuery = (id: string) => ({
  queryKey: ['catalog', 'ingredient-usage', id] as const,
  queryFn: () => apiFetch<IngredientUsageApi>(`/v1/catalog/modifier-options/${id}/usage`),
  staleTime: STALE_STABLE,
});

export const ingredientStopListQuery = (locationId: string) => ({
  queryKey: ['catalog', 'ingredient-stop-list', locationId] as const,
  queryFn: () => apiFetch<OptionStopListResponse>('/v1/catalog/stop-list/options', { locationId }),
  staleTime: STALE_STABLE,
});

export const stopListQuery = (locationId: string) => ({
  queryKey: ['catalog', 'stop-list', locationId] as const,
  queryFn: () => apiFetch<StopListResponse>('/v1/catalog/stop-list', { locationId }),
  staleTime: STALE_STABLE,
});

export const stopListAggregateQuery = () => ({
  queryKey: ['catalog', 'stop-list-aggregate'] as const,
  queryFn: () =>
    apiFetch<AggregateStopListResponse>('/v1/catalog/stop-list/aggregate', {
      locationId: 'all',
    }),
  staleTime: STALE_STABLE,
});

export const draftDiffQuery = () => ({
  queryKey: ['catalog', 'draft-diff'] as const,
  queryFn: () => apiFetch<DraftDiffResponse>('/v1/catalog/draft-diff'),
  staleTime: STALE_DRAFT_DIFF,
});

/**
 * MoneyAmountValue is a STRING by design (packages/domain/src/money.ts — "Never
 * `number` — IEEE-754 silently loses precision"). The forms hold numbers for the
 * input UX, and the read direction already flattens with `Number.parseFloat`;
 * this is the missing write half. `toFixed(2)` rather than `String(n)` because the
 * api regex allows at most two fractional digits.
 */
const toMoney = (value: number): string => value.toFixed(2);

export const upsertCategory = (id: string | null, data: CategoryForm) =>
  apiFetch<CategoryListItemApi>('/v1/catalog/categories', {
    method: 'POST',
    body: { ...data, id: id ?? undefined },
  });

export const reorderCategories = (
  moves: { id: string; parentId: string | null; sortOrder: number }[],
) =>
  apiFetch<{ readonly updated: number }>('/v1/catalog/categories/reorder', {
    method: 'POST',
    body: { moves },
  });

export const archiveCategory = (id: string) =>
  apiFetch(`/v1/catalog/categories/${id}/archive`, {
    method: 'PATCH',
  });

export const upsertItem = (
  id: string | null,
  data: ItemEditorForm & { readonly photoS3Key?: string | null },
) => {
  // The api's UpsertItemInputSchema declares `photos` with `.default([])` and the
  // repository writes it unconditionally on both the insert and the update path. A body
  // without `photos` therefore does not "leave photos alone" — it erases them. The
  // editor tracks a single photo, so send it in the contract's own shape.
  const { photoS3Key, ...rest } = data;
  return apiFetch<{ readonly id: string }>('/v1/catalog/items', {
    method: 'POST',
    body: {
      ...rest,
      basePrice: toMoney(data.basePrice),
      photos: photoS3Key ? [{ s3Key: photoS3Key, sortOrder: 0 }] : [],
      id: id ?? undefined,
    },
  });
};

export const archiveItem = (id: string) =>
  apiFetch(`/v1/catalog/items/${id}/archive`, {
    method: 'PATCH',
  });

export const upsertItemSize = (
  itemId: string,
  data: Omit<SizeForm, 'name'> & { readonly name: LocalizedText; readonly id?: string },
) =>
  apiFetch<ItemSizeApi>('/v1/catalog/item-sizes', {
    method: 'POST',
    body: {
      ...data,
      price: toMoney(data.price),
      menuItemId: itemId,
    },
  });

export const upsertItemModifierGroups = (itemId: string, modifierGroupIds: readonly string[]) =>
  apiFetch(`/v1/catalog/items/${itemId}/modifier-groups`, {
    method: 'PUT',
    body: { modifierGroupIds },
  });

// D-05: stop/unstop write endpoints stay location-scoped — locationId is
// required (never 'all') and is the operator's currently selected location.
export const toggleStopList = (
  itemId: string,
  next: 'paused' | 'published',
  locationId: string,
) => {
  if (next === 'paused') {
    return apiFetch('/v1/catalog/stop-list', {
      method: 'POST',
      body: { itemId },
      locationId,
    });
  }
  return apiFetch(`/v1/catalog/stop-list/${itemId}`, {
    method: 'DELETE',
    locationId,
  });
};

export const resetStopList = async (locationId: string): Promise<{ ok: boolean }> => {
  const res = await apiFetch<StopListResponse>('/v1/catalog/stop-list', { locationId });
  if (!res.ok) return { ok: false };
  for (const item of res.data?.items ?? []) {
    const del = await apiFetch(`/v1/catalog/stop-list/${item.itemId}`, {
      method: 'DELETE',
      locationId,
    });
    if (!del.ok) return { ok: false };
  }
  const optionsRes = await apiFetch<OptionStopListResponse>('/v1/catalog/stop-list/options', {
    locationId,
  });
  if (!optionsRes.ok) return { ok: false };
  for (const item of optionsRes.data?.items ?? []) {
    const del = await apiFetch(`/v1/catalog/stop-list/options/${item.optionId}`, {
      method: 'DELETE',
      locationId,
    });
    if (!del.ok) return { ok: false };
  }
  return { ok: true };
};

export const upsertModifierGroup = (
  id: string | null,
  data: Omit<ModifierGroupForm, 'name'> & { readonly name: LocalizedText },
) =>
  apiFetch<ModifierGroupApi>('/v1/catalog/modifier-groups', {
    method: 'POST',
    body: { ...data, id: id ?? undefined },
  });

export const upsertModifierOption = (
  groupId: string,
  data: Omit<ModifierOptionForm, 'name'> & { readonly name: LocalizedText; readonly id?: string },
) =>
  apiFetch<ModifierOptionApi>('/v1/catalog/modifier-options', {
    method: 'POST',
    body: {
      ...data,
      priceDelta: toMoney(data.priceDelta),
      modifierGroupId: groupId,
    },
  });

// UpsertModifierOptionInputDto.description is LocalizedText on the wire (apps/api dto.ts) —
// IngredientFormSchema.description is a plain string for the sheet's single, unlocalized field.
export const upsertIngredient = (
  id: string | null,
  data: Omit<IngredientForm, 'name' | 'description'> & {
    readonly name: LocalizedText;
    readonly description: LocalizedText | null;
  },
) =>
  apiFetch<IdResponseApi>('/v1/catalog/modifier-options', {
    method: 'POST',
    body: { ...data, priceDelta: toMoney(data.priceDelta), id: id ?? undefined },
  });

export const archiveIngredient = (id: string) =>
  apiFetch<IngredientUsageApi>(`/v1/catalog/modifier-options/${id}/archive`, {
    method: 'PATCH',
  });

export const setGroupIngredients = (groupId: string, optionIds: readonly string[]) =>
  apiFetch<IdResponseApi>(`/v1/catalog/modifier-groups/${groupId}/options`, {
    method: 'PUT',
    body: { optionIds },
  });

export const setItemIngredients = (itemId: string, optionIds: readonly string[]) =>
  apiFetch<IdResponseApi>(`/v1/catalog/items/${itemId}/modifier-options`, {
    method: 'PUT',
    body: { optionIds },
  });

export interface ItemCompositionPayload {
  readonly mode: 'text' | 'assembled';
  readonly text: readonly string[];
  readonly lines: readonly { optionId: string; removable: boolean }[];
}

export const setItemComposition = (itemId: string, payload: ItemCompositionPayload) =>
  apiFetch<IdResponseApi>(`/v1/catalog/items/${itemId}/composition`, {
    method: 'PUT',
    body: payload,
  });

// D-20: only the operator stops an ingredient — locationId is required (never
// 'all') and is the operator's currently selected location, same as toggleStopList.
export const toggleIngredientStopList = (
  optionId: string,
  stopped: boolean,
  locationId: string,
) => {
  if (stopped) {
    return apiFetch<IdResponseApi>('/v1/catalog/stop-list/options', {
      method: 'POST',
      body: { optionId },
      locationId,
    });
  }
  return apiFetch(`/v1/catalog/stop-list/options/${optionId}`, {
    method: 'DELETE',
    locationId,
  });
};

export const getPhotoUploadUrl = (input: {
  contentType: string;
  sizeBytes: number;
  kind?: 'item' | 'ingredient';
}) =>
  apiFetch<PhotoUploadUrlResponse>('/v1/catalog/photo-upload-url', {
    method: 'POST',
    body: input,
  });

export const schedulePublish = () =>
  apiFetch<{ readonly scheduled: boolean; readonly cancelAfterMs: number }>('/v1/catalog/publish', {
    method: 'POST',
  });

export const cancelPublish = () =>
  apiFetch<{ readonly cancelled: boolean }>('/v1/catalog/publish', {
    method: 'DELETE',
  });
