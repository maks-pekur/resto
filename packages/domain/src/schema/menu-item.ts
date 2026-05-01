import { z } from 'zod';
import { MenuCategoryId, MenuItemId, TenantId } from '../ids';
import { LocalizedText } from '../localized-text';
import { Currency, MoneyAmount } from '../money';
import { Slug } from '../slug';
import { timestampsShape } from './_shared';

/**
 * Lifecycle of a menu item. Only `published` items are visible to public
 * read endpoints (qr-menu, customer apps).
 */
export const MenuItemStatus = z.enum(['draft', 'published', 'archived']);
export type MenuItemStatus = z.infer<typeof MenuItemStatus>;

/**
 * A single sellable unit on a menu. Variants and modifiers attach via
 * separate junction rows in the database; the public projection assembles
 * them into a denormalized read model in the catalog context.
 */
export const MenuItem = z.object({
  id: MenuItemId,
  tenantId: TenantId,
  categoryId: MenuCategoryId,
  slug: Slug,
  name: LocalizedText,
  description: LocalizedText.nullable(),
  basePrice: MoneyAmount,
  currency: Currency,
  imageS3Key: z.string().min(1).nullable(),
  /** Allergen tags (e.g. `gluten`, `dairy`, `nuts`). Mandatory disclosure when present. */
  allergens: z.array(z.string().min(1)).nullable(),
  status: MenuItemStatus,
  sortOrder: z.number().int().nonnegative(),
  ...timestampsShape,
});
export type MenuItem = z.infer<typeof MenuItem>;
