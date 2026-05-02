import type {
  Currency,
  LocalizedText,
  MenuCategoryId,
  MenuItemId,
  MenuModifierId,
  MenuVariantId,
  MoneyAmount,
  PriceDelta,
} from '@resto/domain';

/**
 * Denormalized read model returned by the public `GET /v1/menu` path.
 *
 * Wire shape: localized text as `Record<string, string>`, money as
 * decimal strings, currency as ISO-4217 code. No floats anywhere on the
 * boundary — the domain primitives in `@resto/domain` enforce that, and
 * this projection just preserves the shape on the way out.
 */
export interface PublishedMenuVariant {
  readonly id: MenuVariantId;
  readonly name: LocalizedText;
  readonly priceDelta: PriceDelta;
  readonly isDefault: boolean;
  readonly sortOrder: number;
}

export interface PublishedMenuModifierOption {
  readonly id: string;
  readonly name: LocalizedText;
  readonly priceDelta: PriceDelta;
  readonly sortOrder: number;
}

export interface PublishedMenuModifier {
  readonly id: MenuModifierId;
  readonly name: LocalizedText;
  readonly minSelectable: number;
  readonly maxSelectable: number;
  readonly isRequired: boolean;
  readonly options: readonly PublishedMenuModifierOption[];
}

export interface PublishedMenuItem {
  readonly id: MenuItemId;
  readonly slug: string;
  readonly categoryId: MenuCategoryId;
  readonly name: LocalizedText;
  readonly description: LocalizedText | null;
  readonly basePrice: MoneyAmount;
  readonly currency: Currency;
  /**
   * Short-lived presigned GET URL for the item image, or `null` if the
   * item has no photo. The raw S3 key never crosses the API boundary
   * (RES-92): the bucket is private, presigning happens server-side at
   * read time. URL TTL matches the catalog cache TTL.
   */
  readonly imageUrl: string | null;
  readonly allergens: readonly string[];
  readonly sortOrder: number;
  readonly variants: readonly PublishedMenuVariant[];
  readonly modifierIds: readonly MenuModifierId[];
}

export interface PublishedMenuCategory {
  readonly id: MenuCategoryId;
  readonly slug: string;
  readonly name: LocalizedText;
  readonly description: LocalizedText | null;
  readonly sortOrder: number;
}

/**
 * Top-level read DTO. `version` is the cache key suffix — the publish
 * service bumps it; the cache adapter uses it to invalidate without
 * scanning Redis keys.
 */
export interface PublishedMenu {
  readonly tenantId: string;
  readonly version: number;
  readonly currency: Currency;
  readonly categories: readonly PublishedMenuCategory[];
  readonly items: readonly PublishedMenuItem[];
  readonly modifiers: readonly PublishedMenuModifier[];
}
