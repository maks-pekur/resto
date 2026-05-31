import { z } from 'zod';

/**
 * Frontend Zod schemas for the catalog admin UI (D-4b-07).
 *
 * `CategoryFormSchema` mirrors the api's `UpsertCategoryInputSchema` field
 * shape but accepts a plain-string `name` (the boundary helper in
 * `localized.ts` lifts it into `LocalizedText` before the POST).
 *
 * `refineCategoryDepth` enforces D-4b-01: tree depth capped at 2 levels.
 * The disable-state on `CategorySelect` is the first line of defence (UI
 * doesn't let the operator pick a depth-3 parent); this refine is the
 * second line (catches a tampered form-submit that bypasses the picker).
 */

export const CategoryFormSchema = z.object({
  name: z.string().trim().min(1).max(255),
  parentId: z.string().uuid().nullable(),
  sortOrder: z.number().int().nonnegative(),
});

export type CategoryForm = z.infer<typeof CategoryFormSchema>;

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
