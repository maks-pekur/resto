import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { CurrencyValue, LocalizedText, MoneyAmountValue, Slug } from '@resto/domain';

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

export const UpsertCategoryInputSchema = z.object({
  id: z.string().uuid().optional(),
  slug: Slug.optional(),
  parentId: z.string().uuid().nullable().default(null),
  name: LocalizedText,
  description: LocalizedText.nullable().default(null),
  sortOrder: NonNegInt.default(0),
});
export type UpsertCategoryInput = z.infer<typeof UpsertCategoryInputSchema>;
export class UpsertCategoryInputDto extends createZodDto(UpsertCategoryInputSchema) {}

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
  proteins: z.number().min(0).max(999.99).nullable().default(null),
  fats: z.number().min(0).max(999.99).nullable().default(null),
  carbs: z.number().min(0).max(999.99).nullable().default(null),
  kcal: z.number().int().min(0).max(32000).nullable().default(null),
  nutritionEstimated: z.boolean().default(false),
  source: z.enum(['manual', 'ai_generated', 'imported_iiko', 'imported_csv']).default('manual'),
  needsReview: z.boolean().default(false),
  sourceExternalId: z.string().max(255).nullable().default(null),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  sortOrder: NonNegInt.default(0),
});
export type UpsertItemInput = z.infer<typeof UpsertItemInputSchema>;
export class UpsertItemInputDto extends createZodDto(UpsertItemInputSchema) {}

export const UpsertModifierGroupInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: LocalizedText,
    minSelectable: NonNegInt.default(0),
    maxSelectable: NonNegInt.default(1),
    isRequired: z.boolean().default(false),
  })
  .refine((m) => m.maxSelectable >= m.minSelectable, {
    message: 'maxSelectable must be greater than or equal to minSelectable',
    path: ['maxSelectable'],
  });
export type UpsertModifierGroupInput = z.infer<typeof UpsertModifierGroupInputSchema>;
export class UpsertModifierGroupInputDto extends createZodDto(UpsertModifierGroupInputSchema) {}

export const UpsertModifierOptionInputSchema = z.object({
  id: z.string().uuid().optional(),
  modifierGroupId: z.string().uuid(),
  name: LocalizedText,
  priceDelta: MoneyAmountValue,
  defaultAmount: NonNegInt.default(0),
  freeAmount: NonNegInt.default(0),
  sortOrder: NonNegInt.default(0),
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

export const StopItemInputSchema = z.object({
  itemId: z.string().uuid(),
  reason: z.string().max(500).nullable().default(null),
});
export type StopItemInput = z.infer<typeof StopItemInputSchema>;
export class StopItemInputDto extends createZodDto(StopItemInputSchema) {}
