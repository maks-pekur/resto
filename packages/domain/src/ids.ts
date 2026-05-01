import { z } from 'zod';

/**
 * Branded UUID identifiers.
 *
 * Each id is a UUID v4 at runtime but a *distinct* type at compile time.
 * This means a `MenuItemId` cannot accidentally be passed where a
 * `TenantId` is expected — TypeScript catches the mistake before the
 * code ever runs.
 *
 * Brands are erased at runtime; nothing extra is stored or sent over the
 * wire. The schemas re-export Zod's `.brand<...>()` chain.
 */

export const TenantId = z.string().uuid().brand<'TenantId'>();
export type TenantId = z.infer<typeof TenantId>;

export const UserId = z.string().uuid().brand<'UserId'>();
export type UserId = z.infer<typeof UserId>;

export const MenuCategoryId = z.string().uuid().brand<'MenuCategoryId'>();
export type MenuCategoryId = z.infer<typeof MenuCategoryId>;

export const MenuItemId = z.string().uuid().brand<'MenuItemId'>();
export type MenuItemId = z.infer<typeof MenuItemId>;

export const MenuModifierId = z.string().uuid().brand<'MenuModifierId'>();
export type MenuModifierId = z.infer<typeof MenuModifierId>;

export const MenuVariantId = z.string().uuid().brand<'MenuVariantId'>();
export type MenuVariantId = z.infer<typeof MenuVariantId>;
