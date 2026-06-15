import { z } from 'zod';

const PercentageDiscountSchema = z.discriminatedUnion('scope', [
  z.object({
    kind: z.literal('percentage'),
    scope: z.literal('cart'),
    pct: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('percentage'),
    scope: z.literal('category'),
    categoryId: z.string(),
    pct: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('percentage'),
    scope: z.literal('item'),
    itemId: z.string(),
    pct: z.number().int().nonnegative(),
  }),
]);

const FixedDiscountSchema = z.discriminatedUnion('scope', [
  z.object({
    kind: z.literal('fixed'),
    scope: z.literal('cart'),
    amountMinorUnits: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('fixed'),
    scope: z.literal('category'),
    categoryId: z.string(),
    amountMinorUnits: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('fixed'),
    scope: z.literal('item'),
    itemId: z.string(),
    amountMinorUnits: z.number().int().nonnegative(),
  }),
]);

export const DiscountSpecSchema = z.union([PercentageDiscountSchema, FixedDiscountSchema]);

export type DiscountSpec = z.infer<typeof DiscountSpecSchema>;

export interface OrderLineDraft {
  readonly itemId: string;
  readonly categoryId: string;
  readonly lineTotal: number;
}

function eligibleSum(lines: readonly OrderLineDraft[]): number {
  return lines.reduce((sum, l) => sum + l.lineTotal, 0);
}

export function applyDiscount(lines: readonly OrderLineDraft[], spec: DiscountSpec | null): number {
  if (!spec) return 0;

  if (spec.kind === 'percentage') {
    const eligible =
      spec.scope === 'cart'
        ? eligibleSum(lines)
        : spec.scope === 'category'
          ? eligibleSum(lines.filter((l) => l.categoryId === spec.categoryId))
          : eligibleSum(lines.filter((l) => l.itemId === spec.itemId));
    const computed = Math.round((eligible * spec.pct) / 100);
    return Math.max(0, Math.min(eligible, computed));
  }

  const eligible =
    spec.scope === 'cart'
      ? eligibleSum(lines)
      : spec.scope === 'category'
        ? eligibleSum(lines.filter((l) => l.categoryId === spec.categoryId))
        : eligibleSum(lines.filter((l) => l.itemId === spec.itemId));
  return Math.max(0, Math.min(eligible, spec.amountMinorUnits));
}
