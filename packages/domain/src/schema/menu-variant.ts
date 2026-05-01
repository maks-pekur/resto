import { z } from 'zod';
import { MenuItemId, MenuVariantId, TenantId } from '../ids';
import { LocalizedText } from '../localized-text';
import { PriceDelta } from '../money';
import { timestampsShape } from './_shared';

/**
 * A variant of a menu item: e.g. "Small / Medium / Large", "330ml /
 * 500ml". `priceDelta` is added to the parent item's `basePrice` when
 * this variant is chosen — signed because some variants are cheaper than
 * the default.
 */
export const MenuVariant = z.object({
  id: MenuVariantId,
  tenantId: TenantId,
  menuItemId: MenuItemId,
  name: LocalizedText,
  priceDelta: PriceDelta,
  isDefault: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  ...timestampsShape,
});
export type MenuVariant = z.infer<typeof MenuVariant>;
