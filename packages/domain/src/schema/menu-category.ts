import { z } from 'zod';
import { MenuCategoryId, TenantId } from '../ids';
import { LocalizedText } from '../localized-text';
import { Slug } from '../slug';
import { timestampsShape } from './_shared';

/**
 * A grouping of menu items, e.g. "Pizza", "Drinks". Names are localized
 * so the qr-menu can render in the customer's locale.
 */
export const MenuCategory = z.object({
  id: MenuCategoryId,
  tenantId: TenantId,
  slug: Slug,
  name: LocalizedText,
  description: LocalizedText.nullable(),
  sortOrder: z.number().int().nonnegative(),
  ...timestampsShape,
});
export type MenuCategory = z.infer<typeof MenuCategory>;
