import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { Currency, LocalizedText, MoneyAmount, Slug } from '@resto/domain';
import { parse as parseYaml } from 'yaml';

/**
 * Operator-supplied menu YAML schema. Validates against the same domain
 * primitives the api uses (currency, localized text, slug, money) so a
 * malformed file fails fast with a Zod issue list before any HTTP call.
 */

const NonNegInt = z.number().int().nonnegative();

const CategorySchema = z.object({
  slug: Slug,
  name: LocalizedText,
  description: LocalizedText.optional(),
  sortOrder: NonNegInt.default(0),
});

const VariantSchema = z.object({
  name: LocalizedText,
  priceDelta: z.string(),
  isDefault: z.boolean().default(false),
  sortOrder: NonNegInt.default(0),
});

const ItemSchema = z.object({
  slug: Slug,
  category: Slug,
  name: LocalizedText,
  description: LocalizedText.optional(),
  basePrice: MoneyAmount,
  imageS3Key: z.string().min(1).optional(),
  allergens: z.array(z.string().min(1)).optional(),
  sortOrder: NonNegInt.default(0),
  status: z.enum(['draft', 'published']).default('published'),
  variants: z.array(VariantSchema).default([]),
});

const ModifierSchema = z.object({
  slug: Slug,
  name: LocalizedText,
  minSelectable: NonNegInt.default(0),
  maxSelectable: NonNegInt.default(1),
  isRequired: z.boolean().default(false),
});

export const MenuYamlSchema = z.object({
  currency: Currency,
  categories: z.array(CategorySchema),
  items: z.array(ItemSchema),
  modifiers: z.array(ModifierSchema).default([]),
});
export type MenuYaml = z.infer<typeof MenuYamlSchema>;

export class MenuYamlError extends Error {
  constructor(
    public readonly file: string,
    public readonly issues: z.ZodIssue[],
  ) {
    const summary = issues
      .map((issue) => `  - ${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('\n');
    super(`Menu YAML at ${file} failed validation:\n${summary}`);
    this.name = 'MenuYamlError';
  }
}

export const loadMenuYaml = (file: string): MenuYaml => {
  const raw = readFileSync(file, 'utf8');
  const parsed: unknown = parseYaml(raw);
  const result = MenuYamlSchema.safeParse(parsed);
  if (!result.success) {
    throw new MenuYamlError(file, result.error.issues);
  }
  return result.data;
};
