import { z } from 'zod';
import { MenuModifierId, TenantId } from '../ids';
import { LocalizedText } from '../localized-text';
import { MoneyAmount } from '../money';
import { timestampsShape } from './_shared';

/**
 * A modifier group attached to menu items, e.g. "Toppings", "Sauce",
 * "Spice level". D-07: shape is `display` (tiles | tabs) + `behaviour`
 * (one | several) + `isRequired` — no numeric selection range.
 *
 * Individual options inside a modifier group live in a separate table
 * and are not modelled in the MVP-1 domain — the qr-menu read endpoint
 * inlines them as a denormalized projection in the catalog context.
 */
export const MenuModifier = z.object({
  id: MenuModifierId,
  tenantId: TenantId,
  name: LocalizedText,
  display: z.enum(['tiles', 'tabs']),
  behaviour: z.enum(['one', 'several']),
  isRequired: z.boolean(),
  ...timestampsShape,
});
export type MenuModifier = z.infer<typeof MenuModifier>;

const MenuModifierOptionBase = z.object({
  id: z.string().uuid(),
  name: LocalizedText,
  description: LocalizedText.nullable(),
  imageS3Key: z.string().max(1024).nullable(),
  priceDelta: MoneyAmount,
  defaultAmount: z.number().int().nonnegative(),
  freeAmount: z.number().int().nonnegative(),
  sortOrder: z.number().int().nonnegative(),
  minAmount: z.number().int().nonnegative().nullable(),
  maxAmount: z.number().int().nonnegative().nullable(),
});

export const MenuModifierOption = MenuModifierOptionBase.refine(
  (o) => o.minAmount === null || o.maxAmount === null || o.maxAmount >= o.minAmount,
  { message: 'maxAmount must be greater than or equal to minAmount', path: ['maxAmount'] },
);
export type MenuModifierOption = z.infer<typeof MenuModifierOption>;
