/**
 * Public surface of `@resto/domain`.
 *
 * Apps and other packages depend on this package only via the explicit
 * re-exports here. Internal files (anything not re-exported below) are
 * not part of the contract and may move without notice.
 */

export {
  TenantId,
  LocationId,
  MenuCategoryId,
  MenuItemId,
  MenuModifierId,
  MenuVariantId,
  OrderId,
  OrderItemId,
} from './ids';

export { Currency, CurrencyValue, Money, MoneyAmount, MoneyAmountValue, PriceDelta } from './money';
export { LocalizedText } from './localized-text';
export { Slug } from './slug';
export { slugifyName } from './slugify';
export { LOCATION_RESERVED_SLUGS, LOCATION_RESERVED_SLUG_SET, LocationSlug } from './location-slug';
export { ADMIN_ROOT_ROUTE_SEGMENTS, RESERVED_SLUGS, RESERVED_SLUG_SET } from './reserved-slugs';
export { TENANT_RESERVED_SLUGS, TenantSlug, TenantSlugValue } from './tenant-slug';
export { TenantTheme } from './tenant-theme';
export {
  COUNTRY_REGISTRY,
  CountryCodeValue,
  SUPPORTED_COUNTRIES,
  currencyForCountry,
  defaultLocaleForCountry,
  defaultTimezoneForCountry,
} from './country';
export type { CountryConfig } from './country';

export {
  MeasureUnit,
  MenuCategory,
  MenuItem,
  MenuItemStatus,
  MenuModifier,
  MenuModifierOption,
  MenuVariant,
  Tenant,
  TenantStatus,
} from './schema';

export * from './rbac';

export * from './content-locales';
export * from './brand';
