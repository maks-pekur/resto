import { z } from 'zod';

export const TenantId = z.string().uuid().brand<'TenantId'>();
export type TenantId = z.infer<typeof TenantId>;

export const LocationId = z.string().uuid().brand<'LocationId'>();
export type LocationId = z.infer<typeof LocationId>;

export const MenuCategoryId = z.string().uuid().brand<'MenuCategoryId'>();
export type MenuCategoryId = z.infer<typeof MenuCategoryId>;

export const MenuItemId = z.string().uuid().brand<'MenuItemId'>();
export type MenuItemId = z.infer<typeof MenuItemId>;

export const MenuModifierId = z.string().uuid().brand<'MenuModifierId'>();
export type MenuModifierId = z.infer<typeof MenuModifierId>;

export const MenuVariantId = z.string().uuid().brand<'MenuVariantId'>();
export type MenuVariantId = z.infer<typeof MenuVariantId>;

export const OrderId = z.string().uuid().brand<'OrderId'>();
export type OrderId = z.infer<typeof OrderId>;

export const OrderItemId = z.string().uuid().brand<'OrderItemId'>();
export type OrderItemId = z.infer<typeof OrderItemId>;
