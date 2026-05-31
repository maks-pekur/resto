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

export type ItemListStatusFilter =
  | 'all-except-archived'
  | 'draft'
  | 'published'
  | 'paused'
  | 'archived';

const KNOWN_STATUS_FILTERS: ReadonlySet<ItemListStatusFilter> = new Set<ItemListStatusFilter>([
  'all-except-archived',
  'draft',
  'published',
  'paused',
  'archived',
]);

export const coerceStatusFilter = (raw: string | undefined): ItemListStatusFilter => {
  if (raw && KNOWN_STATUS_FILTERS.has(raw as ItemListStatusFilter)) {
    return raw as ItemListStatusFilter;
  }
  return 'all-except-archived';
};
