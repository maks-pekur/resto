/**
 * Public surface of `@resto/domain`.
 *
 * Apps and other packages depend on this package only via the explicit
 * re-exports here. Internal files (anything not re-exported below) are
 * not part of the contract and may move without notice.
 */

export { TenantId, UserId, MenuCategoryId, MenuItemId, MenuModifierId, MenuVariantId } from './ids';

export { Currency, Money, MoneyAmount, PriceDelta } from './money';
export { LocalizedText } from './localized-text';
export { Slug } from './slug';
export { TENANT_RESERVED_SLUGS, TenantSlug } from './tenant-slug';

export {
  MenuCategory,
  MenuItem,
  MenuItemStatus,
  MenuModifier,
  MenuVariant,
  Tenant,
  TenantStatus,
  User,
  UserRole,
} from './schema';
