import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { CurrencyValue, LocalizedText, MoneyAmountValue, Slug } from '@resto/domain';

const NonNegInt = z.number().int().nonnegative();

export const UpsertCategoryInputSchema = z.object({
  id: z.string().uuid().optional(),
  slug: Slug,
  name: LocalizedText,
  description: LocalizedText.nullable().default(null),
  sortOrder: NonNegInt.default(0),
});
export type UpsertCategoryInput = z.infer<typeof UpsertCategoryInputSchema>;
export class UpsertCategoryInputDto extends createZodDto(UpsertCategoryInputSchema) {}

export const UpsertItemInputSchema = z.object({
  id: z.string().uuid().optional(),
  categoryId: z.string().uuid(),
  slug: Slug,
  name: LocalizedText,
  description: LocalizedText.nullable().default(null),
  basePrice: MoneyAmountValue,
  currency: CurrencyValue,
  imageS3Key: z.string().min(1).nullable().default(null),
  allergens: z.array(z.string().min(1)).nullable().default(null),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  sortOrder: NonNegInt.default(0),
});
export type UpsertItemInput = z.infer<typeof UpsertItemInputSchema>;
export class UpsertItemInputDto extends createZodDto(UpsertItemInputSchema) {}

export const UpsertModifierInputSchema = z
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
export type UpsertModifierInput = z.infer<typeof UpsertModifierInputSchema>;
export class UpsertModifierInputDto extends createZodDto(UpsertModifierInputSchema) {}
