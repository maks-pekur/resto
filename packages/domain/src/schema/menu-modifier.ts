import { z } from 'zod';
import { MenuModifierId, TenantId } from '../ids';
import { LocalizedText } from '../localized-text';
import { timestampsShape } from './_shared';

/**
 * A modifier group attached to menu items, e.g. "Toppings", "Sauce",
 * "Spice level". Constrains how many options a customer may pick at
 * order time via `[minSelectable, maxSelectable]`.
 *
 * Individual options inside a modifier group live in a separate table
 * and are not modelled in the MVP-1 domain — the qr-menu read endpoint
 * inlines them as a denormalized projection in the catalog context.
 */
export const MenuModifier = z
  .object({
    id: MenuModifierId,
    tenantId: TenantId,
    name: LocalizedText,
    minSelectable: z.number().int().nonnegative(),
    maxSelectable: z.number().int().nonnegative(),
    isRequired: z.boolean(),
    ...timestampsShape,
  })
  .refine(
    (m) => m.maxSelectable >= m.minSelectable,
    'maxSelectable must be greater than or equal to minSelectable',
  );
export type MenuModifier = z.infer<typeof MenuModifier>;
