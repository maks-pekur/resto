import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  CurrencyValue,
  LocalizedText,
  MoneyAmountValue,
  Slug,
  DIETS,
  DietSchema,
} from '@resto/domain';

const NonNegInt = z.number().int().nonnegative();

export const MenuItemPhotoSchema = z.object({
  s3Key: z
    .string()
    .min(1)
    .max(1024)
    .refine((s) => !/^https?:/i.test(s), 'must be an S3 key, not a URL'),
  sortOrder: NonNegInt,
  alt: z.string().max(255).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  isPrimary: z.boolean().optional(),
});
export type MenuItemPhoto = z.infer<typeof MenuItemPhotoSchema>;

/** A photo as an operator surface reads it. The stored value is an S3 key in a private
 * prefix, so a browser cannot render it directly — reads carry a short-lived presigned
 * `url` alongside the key. The key stays in the payload because the editor sends it
 * back on save; the url is never accepted as input. */
export const MenuItemPhotoResponseSchema = MenuItemPhotoSchema.extend({
  url: z.string(),
});

export const UpsertCategoryInputSchema = z.object({
  id: z.string().uuid().optional(),
  slug: Slug.optional(),
  parentId: z.string().uuid().nullable().default(null),
  name: LocalizedText,
  description: LocalizedText.nullable().default(null),
  sortOrder: NonNegInt.default(0),
  code: z.string().min(1).max(64).nullable().default(null),
});
export type UpsertCategoryInput = z.infer<typeof UpsertCategoryInputSchema>;
export class UpsertCategoryInputDto extends createZodDto(UpsertCategoryInputSchema) {}

export const CategoryMoveSchema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  sortOrder: z.number().int().nonnegative(),
});
export type CategoryMove = z.infer<typeof CategoryMoveSchema>;

export const ReorderCategoriesInputSchema = z.object({
  moves: z.array(CategoryMoveSchema).min(1).max(500),
});
export type ReorderCategoriesInput = z.infer<typeof ReorderCategoriesInputSchema>;
export class ReorderCategoriesInputDto extends createZodDto(ReorderCategoriesInputSchema) {}

export const ReorderCategoriesResponseSchema = z.object({
  updated: z.number().int().nonnegative(),
});
export type ReorderCategoriesResponse = z.infer<typeof ReorderCategoriesResponseSchema>;
export class ReorderCategoriesResponseDto extends createZodDto(ReorderCategoriesResponseSchema) {}

export const UpsertItemInputSchema = z.object({
  id: z.string().uuid().optional(),
  categoryId: z.string().uuid(),
  slug: Slug.optional(),
  name: LocalizedText,
  description: LocalizedText.nullable().default(null),
  basePrice: MoneyAmountValue,
  currency: CurrencyValue,
  photos: z.array(MenuItemPhotoSchema).max(20).default([]),
  allergens: z.array(z.string().min(1).max(100)).max(50).nullable().default(null),
  diets: z.array(DietSchema).max(DIETS.length).nullable().default(null),
  composition: z.array(z.string().min(1).max(100)).max(50).nullable().default(null),
  compositionMode: z.enum(['text', 'assembled']).default('text'),
  compositionAssembled: z
    .array(z.object({ optionId: z.string().uuid(), removable: z.boolean() }))
    .max(50)
    .default([]),
  metaTitle: z.string().max(70).nullable().default(null),
  metaDescription: z.string().max(160).nullable().default(null),
  proteins: z.number().min(0).max(999.99).nullable().default(null),
  fats: z.number().min(0).max(999.99).nullable().default(null),
  carbs: z.number().min(0).max(999.99).nullable().default(null),
  kcal: z.number().int().min(0).max(32000).nullable().default(null),
  source: z.enum(['manual', 'ai_generated', 'imported_iiko', 'imported_csv']).default('manual'),
  needsReview: z.boolean().default(false),
  sourceExternalId: z.string().max(255).nullable().default(null),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  sortOrder: NonNegInt.default(0),
  code: z.string().min(1).max(64).nullable().default(null),
  weight: z.number().nonnegative().nullable().default(null),
  measureUnit: z.enum(['g', 'kg', 'ml', 'l', 'pcs']).nullable().default(null),
});
export type UpsertItemInput = z.infer<typeof UpsertItemInputSchema>;
export class UpsertItemInputDto extends createZodDto(UpsertItemInputSchema) {}

export const UpsertModifierGroupInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: LocalizedText,
  display: z.enum(['tiles', 'tabs']),
  behaviour: z.enum(['one', 'several']),
  isRequired: z.boolean().default(false),
});
export type UpsertModifierGroupInput = z.infer<typeof UpsertModifierGroupInputSchema>;
export class UpsertModifierGroupInputDto extends createZodDto(UpsertModifierGroupInputSchema) {}

export const UpsertModifierOptionInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: LocalizedText,
    description: LocalizedText.nullable().default(null),
    imageS3Key: z.string().max(1024).nullable().default(null),
    priceDelta: MoneyAmountValue,
    defaultAmount: NonNegInt.default(0),
    freeAmount: NonNegInt.default(0),
    sortOrder: NonNegInt.default(0),
    minAmount: NonNegInt.nullable().default(null),
    maxAmount: NonNegInt.nullable().default(null),
  })
  .refine((o) => o.minAmount === null || o.maxAmount === null || o.maxAmount >= o.minAmount, {
    message: 'maxAmount must be greater than or equal to minAmount',
    path: ['maxAmount'],
  });
export type UpsertModifierOptionInput = z.infer<typeof UpsertModifierOptionInputSchema>;
export class UpsertModifierOptionInputDto extends createZodDto(UpsertModifierOptionInputSchema) {}

export const UpsertItemSizeInputSchema = z.object({
  id: z.string().uuid().optional(),
  menuItemId: z.string().uuid(),
  name: LocalizedText,
  price: MoneyAmountValue,
  isDefault: z.boolean().default(false),
  sortOrder: NonNegInt.default(0),
});
export type UpsertItemSizeInput = z.infer<typeof UpsertItemSizeInputSchema>;
export class UpsertItemSizeInputDto extends createZodDto(UpsertItemSizeInputSchema) {}

export const SetItemModifierGroupsInputSchema = z.object({
  modifierGroupIds: z.array(z.string().uuid()).max(50),
});
export type SetItemModifierGroupsInput = z.infer<typeof SetItemModifierGroupsInputSchema>;
export class SetItemModifierGroupsInputDto extends createZodDto(SetItemModifierGroupsInputSchema) {}

export const SetGroupModifierOptionsInputSchema = z.object({
  optionIds: z.array(z.string().uuid()).max(200),
});
export type SetGroupModifierOptionsInput = z.infer<typeof SetGroupModifierOptionsInputSchema>;
export class SetGroupModifierOptionsInputDto extends createZodDto(
  SetGroupModifierOptionsInputSchema,
) {}

export const SetItemModifierOptionsInputSchema = z.object({
  optionIds: z.array(z.string().uuid()).max(200),
});
export type SetItemModifierOptionsInput = z.infer<typeof SetItemModifierOptionsInputSchema>;
export class SetItemModifierOptionsInputDto extends createZodDto(
  SetItemModifierOptionsInputSchema,
) {}

// createZodDto's class extension requires a single object type; a true discriminatedUnion
// produces a union `z.infer` that TS cannot extend a class from (TS2509) — mode picks which
// of the two always-present arrays is active, mirroring the repository's own dual-write shape.
export const SetItemCompositionInputSchema = z.object({
  mode: z.enum(['text', 'assembled']),
  text: z.array(z.string().min(1).max(100)).max(50).default([]),
  lines: z
    .array(z.object({ optionId: z.string().uuid(), removable: z.boolean() }))
    .max(50)
    .default([]),
});
export type SetItemCompositionInput = z.infer<typeof SetItemCompositionInputSchema>;
export class SetItemCompositionInputDto extends createZodDto(SetItemCompositionInputSchema) {}

export const StopItemInputSchema = z.object({
  itemId: z.string().uuid(),
  reason: z.string().max(500).nullable().default(null),
});
export type StopItemInput = z.infer<typeof StopItemInputSchema>;
export class StopItemInputDto extends createZodDto(StopItemInputSchema) {}

export const StopOptionInputSchema = z.object({
  optionId: z.string().uuid(),
  reason: z.string().max(500).nullable().default(null),
});
export type StopOptionInput = z.infer<typeof StopOptionInputSchema>;
export class StopOptionInputDto extends createZodDto(StopOptionInputSchema) {}

const CategoryStatusSchema = z.enum(['draft', 'published', 'archived']);
const ItemStatusSchema = z.enum(['draft', 'published', 'archived']);

export const CategoryListItemSchema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  slug: z.string(),
  name: LocalizedText,
  description: LocalizedText.nullable(),
  sortOrder: z.number().int().nonnegative(),
  status: CategoryStatusSchema,
});
export type CategoryListItem = z.infer<typeof CategoryListItemSchema>;
export const CategoryListResponseSchema = z.object({
  items: z.array(CategoryListItemSchema),
});
export type CategoryListResponse = z.infer<typeof CategoryListResponseSchema>;
export class CategoryListResponseDto extends createZodDto(CategoryListResponseSchema) {}

export const ItemListItemSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: LocalizedText,
  categoryId: z.string().uuid(),
  categoryName: LocalizedText.nullable(),
  parentCategoryName: LocalizedText.nullable(),
  photo: z
    .object({
      s3Key: z.string(),
      sortOrder: z.number().int().nonnegative(),
      url: z.string(),
    })
    .nullable(),
  basePrice: MoneyAmountValue,
  currency: CurrencyValue,
  status: ItemStatusSchema,
  hasSizes: z.boolean(),
  stoppedAt: z.string().datetime().nullable(),
  sortOrder: z.number().int().nonnegative(),
});
export type ItemListItem = z.infer<typeof ItemListItemSchema>;
export const ItemListResponseSchema = z.object({
  items: z.array(ItemListItemSchema),
  total: NonNegInt,
  limit: NonNegInt,
  offset: NonNegInt,
});
export type ItemListResponse = z.infer<typeof ItemListResponseSchema>;
export class ItemListResponseDto extends createZodDto(ItemListResponseSchema) {}

export const ItemSizeDtoSchema = z.object({
  id: z.string().uuid(),
  name: LocalizedText,
  price: MoneyAmountValue,
  isDefault: z.boolean(),
  sortOrder: NonNegInt,
});

export const ItemDetailResponseSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
  slug: z.string(),
  name: LocalizedText,
  description: LocalizedText.nullable(),
  basePrice: MoneyAmountValue,
  currency: CurrencyValue,
  photos: z.array(MenuItemPhotoResponseSchema),
  allergens: z.array(z.string()).nullable(),
  diets: z.array(z.string()).nullable(),
  composition: z.array(z.string()).nullable(),
  compositionMode: z.enum(['text', 'assembled']),
  compositionAssembled: z.array(z.object({ optionId: z.string().uuid(), removable: z.boolean() })),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  proteins: z.number().nullable(),
  fats: z.number().nullable(),
  carbs: z.number().nullable(),
  kcal: z.number().int().nullable(),
  source: z.enum(['manual', 'ai_generated', 'imported_iiko', 'imported_csv']),
  needsReview: z.boolean(),
  sourceExternalId: z.string().nullable(),
  status: ItemStatusSchema,
  sortOrder: NonNegInt,
  sizes: z.array(ItemSizeDtoSchema),
  modifierGroupIds: z.array(z.string().uuid()),
  modifierOptionIds: z.array(z.string().uuid()),
});
export type ItemDetailResponse = z.infer<typeof ItemDetailResponseSchema>;
export class ItemDetailResponseDto extends createZodDto(ItemDetailResponseSchema) {}

export const ModifierGroupListItemSchema = z.object({
  id: z.string().uuid(),
  name: LocalizedText,
  display: z.enum(['tiles', 'tabs']),
  behaviour: z.enum(['one', 'several']),
  isRequired: z.boolean(),
  optionCount: NonNegInt,
  usageCount: NonNegInt,
});
export type ModifierGroupListItem = z.infer<typeof ModifierGroupListItemSchema>;
export const ModifierGroupListResponseSchema = z.object({
  items: z.array(ModifierGroupListItemSchema),
});
export type ModifierGroupListResponse = z.infer<typeof ModifierGroupListResponseSchema>;
export class ModifierGroupListResponseDto extends createZodDto(ModifierGroupListResponseSchema) {}

export const ModifierOptionDetailSchema = z.object({
  id: z.string().uuid(),
  name: LocalizedText,
  description: LocalizedText.nullable(),
  imageUrl: z.string().nullable(),
  priceDelta: MoneyAmountValue,
  defaultAmount: NonNegInt,
  freeAmount: NonNegInt,
  sortOrder: NonNegInt,
});
export const ModifierGroupDetailResponseSchema = z.object({
  id: z.string().uuid(),
  name: LocalizedText,
  display: z.enum(['tiles', 'tabs']),
  behaviour: z.enum(['one', 'several']),
  isRequired: z.boolean(),
  options: z.array(ModifierOptionDetailSchema),
});
export type ModifierGroupDetailResponse = z.infer<typeof ModifierGroupDetailResponseSchema>;
export class ModifierGroupDetailResponseDto extends createZodDto(
  ModifierGroupDetailResponseSchema,
) {}

export const ModifierOptionListItemSchema = z.object({
  id: z.string().uuid(),
  name: LocalizedText,
  description: LocalizedText.nullable(),
  priceDelta: MoneyAmountValue,
  imageUrl: z.string().nullable(),
  imageS3Key: z.string().nullable(),
  groupCount: NonNegInt,
  dishCount: NonNegInt,
});
export type ModifierOptionListItem = z.infer<typeof ModifierOptionListItemSchema>;
export const ModifierOptionListResponseSchema = z.object({
  items: z.array(ModifierOptionListItemSchema),
});
export type ModifierOptionListResponse = z.infer<typeof ModifierOptionListResponseSchema>;
export class ModifierOptionListResponseDto extends createZodDto(ModifierOptionListResponseSchema) {}

const ModifierOptionUsageRefSchema = z.object({
  id: z.string().uuid(),
  name: LocalizedText,
});
// D-28: the archive warning shows the union of all three; the stop dialog shows
// dishesInComposition only — being an add-on is not being part of the dish (D-22).
export const ModifierOptionUsageResponseSchema = z.object({
  groups: z.array(ModifierOptionUsageRefSchema),
  dishesAttached: z.array(ModifierOptionUsageRefSchema),
  dishesInComposition: z.array(ModifierOptionUsageRefSchema),
});
export type ModifierOptionUsageResponse = z.infer<typeof ModifierOptionUsageResponseSchema>;
export class ModifierOptionUsageResponseDto extends createZodDto(
  ModifierOptionUsageResponseSchema,
) {}

export const StopListEntrySchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  itemName: LocalizedText.nullable(),
  categoryName: LocalizedText.nullable(),
  // Same shape the item list uses: the stored value is a private S3 key, so a read
  // carries a short-lived presigned url beside it.
  photo: z
    .object({
      s3Key: z.string(),
      sortOrder: z.number().int().nonnegative(),
      url: z.string(),
    })
    .nullable(),
  stoppedAt: z.string().datetime(),
  reason: z.string().nullable(),
});
export type StopListEntry = z.infer<typeof StopListEntrySchema>;
export const StopListResponseSchema = z.object({
  items: z.array(StopListEntrySchema),
});
export type StopListResponse = z.infer<typeof StopListResponseSchema>;
export class StopListResponseDto extends createZodDto(StopListResponseSchema) {}

// Item version minus categoryName — an ingredient has no category (UI-SPEC item 8).
export const OptionStopListEntrySchema = z.object({
  id: z.string().uuid(),
  optionId: z.string().uuid(),
  optionName: LocalizedText.nullable(),
  imageUrl: z.string().nullable(),
  stoppedAt: z.string().datetime(),
  reason: z.string().nullable(),
});
export type OptionStopListEntry = z.infer<typeof OptionStopListEntrySchema>;
export const OptionStopListResponseSchema = z.object({
  items: z.array(OptionStopListEntrySchema),
});
export type OptionStopListResponse = z.infer<typeof OptionStopListResponseSchema>;
export class OptionStopListResponseDto extends createZodDto(OptionStopListResponseSchema) {}

export const AggregateStopListEntrySchema = z.object({
  itemId: z.string().uuid(),
  itemName: LocalizedText.nullable(),
  categoryName: LocalizedText.nullable(),
  stoppedLocationCount: z.number().int().nonnegative(),
  lastStoppedAt: z.string().datetime(),
});
export type AggregateStopListEntry = z.infer<typeof AggregateStopListEntrySchema>;
export const AggregateStopListResponseSchema = z.object({
  items: z.array(AggregateStopListEntrySchema),
  totalActiveLocations: z.number().int().nonnegative(),
  totalStoppedItems: NonNegInt,
});
export type AggregateStopListResponse = z.infer<typeof AggregateStopListResponseSchema>;
export class AggregateStopListResponseDto extends createZodDto(AggregateStopListResponseSchema) {}

export const DraftDiffEntitySchema = z.enum(['item', 'category', 'modifier-group']);
export const DraftDiffStatusSchema = z.enum(['draft', 'modified', 'archived']);
export const DraftDiffItemSchema = z.object({
  entityType: DraftDiffEntitySchema,
  id: z.string().uuid(),
  name: LocalizedText,
  status: DraftDiffStatusSchema,
});
export type DraftDiffItem = z.infer<typeof DraftDiffItemSchema>;
export const DraftDiffResponseSchema = z.object({
  unpublishedCount: NonNegInt,
  items: z.array(DraftDiffItemSchema),
  truncatedCount: NonNegInt,
});
export type DraftDiffResponse = z.infer<typeof DraftDiffResponseSchema>;
export class DraftDiffResponseDto extends createZodDto(DraftDiffResponseSchema) {}

// Browser direct-PUT allowlist; must stay in sync with the qr-menu renderer's accepted formats (RES-92).
export const PhotoUploadContentTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);

// SigV4 binds Content-Length into the signed URL, so 5 MiB cap is enforced by S3, not just trust.
const MAX_PHOTO_BYTES = 5_242_880;

export const PhotoUploadUrlInputSchema = z.object({
  contentType: PhotoUploadContentTypeSchema,
  sizeBytes: z.number().int().positive().max(MAX_PHOTO_BYTES),
  kind: z.enum(['item', 'ingredient']).default('item'),
});
export type PhotoUploadUrlInput = z.infer<typeof PhotoUploadUrlInputSchema>;
export class PhotoUploadUrlInputDto extends createZodDto(PhotoUploadUrlInputSchema) {}

export const PhotoUploadUrlResponseSchema = z.object({
  uploadUrl: z.string().url(),
  s3Key: z.string().min(1).max(1024),
});
export type PhotoUploadUrlResponse = z.infer<typeof PhotoUploadUrlResponseSchema>;
export class PhotoUploadUrlResponseDto extends createZodDto(PhotoUploadUrlResponseSchema) {}
