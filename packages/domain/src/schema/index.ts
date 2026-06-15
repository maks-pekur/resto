/**
 * Aggregated re-exports for the schema barrel. The package's public
 * surface is `src/index.ts`; this file is internal and should not be
 * imported directly from outside the package.
 */
export { Tenant, TenantStatus } from './tenant';
// `User` / `UserRole` were removed when identity moved to Better Auth
// (ADR-0013). BA owns the user table; the domain does not project it.
export { MenuCategory } from './menu-category';
export { MenuItem, MenuItemStatus, MeasureUnit } from './menu-item';
export { MenuVariant } from './menu-variant';
export { MenuModifier, MenuModifierOption } from './menu-modifier';
