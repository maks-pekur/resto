import { z } from 'zod';

export const CategoryFormSchema = z.object({
  name: z.string().trim().min(1).max(255),
  parentId: z.string().uuid().nullable(),
  sortOrder: z.number().int().nonnegative(),
});

export type CategoryForm = z.infer<typeof CategoryFormSchema>;

// Second line of defence against depth > 2 (D-4b-01): catches tampered form submits that bypass the disabled UI options.
export const refineCategoryDepth = (
  schema: typeof CategoryFormSchema,
  parentIdToCategory: ReadonlyMap<string, { readonly parentId: string | null }>,
) =>
  schema.superRefine((data, ctx) => {
    if (!data.parentId) return;
    const parent = parentIdToCategory.get(data.parentId);
    if (parent && parent.parentId !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentId'],
        message: 'Уровень вложенности ограничен двумя — родитель уже является подкатегорией.',
      });
    }
  });

export type ItemListStatusFilter = 'all-except-archived' | 'draft' | 'published' | 'archived';

const KNOWN_STATUS_FILTERS: ReadonlySet<ItemListStatusFilter> = new Set<ItemListStatusFilter>([
  'all-except-archived',
  'draft',
  'published',
  'archived',
]);

export const coerceStatusFilter = (raw: string | undefined): ItemListStatusFilter => {
  if (raw && KNOWN_STATUS_FILTERS.has(raw as ItemListStatusFilter)) {
    return raw as ItemListStatusFilter;
  }
  return 'all-except-archived';
};

export const ItemEditorFormSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().max(4096).nullable(),
  categoryId: z.string().uuid(),
  basePrice: z.number().min(0),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  allergens: z.array(z.string().min(1).max(100)).max(50),
  ingredients: z.array(z.string().min(1).max(100)).max(50),
  metaTitle: z.string().max(70).nullable(),
  metaDescription: z.string().max(160).nullable(),
  proteins: z.number().min(0).max(999.99).nullable(),
  fats: z.number().min(0).max(999.99).nullable(),
  carbs: z.number().min(0).max(999.99).nullable(),
  kcal: z.number().int().min(0).max(32000).nullable(),
  nutritionEstimated: z.boolean(),
});

export type ItemEditorForm = z.infer<typeof ItemEditorFormSchema>;

export const SizeFormSchema = z.object({
  name: z.string().trim().min(1).max(100),
  price: z.number().min(0),
  isDefault: z.boolean(),
});

export type SizeForm = z.infer<typeof SizeFormSchema>;

export const ModifierGroupFormSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    minSelectable: z.number().int().min(0).max(99),
    maxSelectable: z.number().int().min(0).max(99),
  })
  .refine((m) => m.maxSelectable === 0 || m.maxSelectable >= m.minSelectable, {
    message: 'Максимум должен быть больше или равен минимуму, либо 0 (без ограничений).',
    path: ['maxSelectable'],
  });

export type ModifierGroupForm = z.infer<typeof ModifierGroupFormSchema>;

export const ModifierOptionFormSchema = z.object({
  name: z.string().trim().min(1).max(255),
  priceDelta: z.number().min(0),
  defaultAmount: z.number().int().min(0),
  freeAmount: z.number().int().min(0),
});

export type ModifierOptionForm = z.infer<typeof ModifierOptionFormSchema>;
