import type {
  BrandId,
  BrandTheme,
  Currency,
  LocalizedText,
  MenuCategoryId,
  MenuItemId,
  MenuModifierId,
  MenuVariantId,
  MoneyAmount,
} from '@resto/domain';

/**
 * Denormalized read model returned by the public `GET /v1/menu` path.
 *
 * Wire shape: localized text as `Record<string, string>`, money as
 * decimal strings, currency as ISO-4217 code. No floats anywhere on the
 * boundary — the domain primitives in `@resto/domain` enforce that, and
 * this projection just preserves the shape on the way out.
 */

/**
 * Item size (D-4a CAT-05 / SCHEMA-MAP §Q2). Renamed from
 * `PublishedMenuVariant`; `price` is the ABSOLUTE per-size price (not a
 * delta over the item's base price) to match iiko `NPSizePriceModel`.
 *
 * The brand `MenuVariantId` is reused as the size id alias — semantically
 * `MenuVariantId === MenuItemSizeId` after the 4a rename. A dedicated
 * `MenuItemSizeId` brand can be introduced later without breaking the
 * wire shape (string UUID).
 */
export interface PublishedMenuItemSize {
  readonly id: MenuVariantId;
  readonly name: LocalizedText;
  readonly price: MoneyAmount;
  readonly isDefault: boolean;
  readonly sortOrder: number;
}

export interface PublishedMenuModifierOption {
  readonly id: string;
  readonly name: LocalizedText;
  readonly priceDelta: MoneyAmount;
  readonly defaultAmount: number;
  readonly freeAmount: number;
  readonly sortOrder: number;
}

/**
 * Modifier group (D-4a CAT-04 / SCHEMA-MAP §Q3). Renamed from
 * `PublishedMenuModifier`; the underlying brand alias maps to
 * `menu_modifier_groups.id`.
 */
export interface PublishedMenuModifierGroup {
  readonly id: MenuModifierId;
  readonly name: LocalizedText;
  readonly minSelectable: number;
  readonly maxSelectable: number;
  readonly isRequired: boolean;
  readonly options: readonly PublishedMenuModifierOption[];
}

/**
 * Photo entry on a published menu item (D-4a-02). Each entry carries
 * its own presigned GET URL (server-signed at read time).
 */
export interface PublishedMenuItemPhoto {
  readonly s3Key: string;
  readonly sortOrder: number;
  readonly alt?: string;
  readonly width?: number;
  readonly height?: number;
  readonly isPrimary?: boolean;
  readonly url: string;
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
   * Backward-compatibility convenience: presigned GET URL of the first
   * photo (or `null` if the item has no photo). Same source as
   * `photos[0]?.url`. Retained so existing qr-menu / website consumers
   * that read a single hero image don't need to update for D-4a-02.
   *
   * The raw S3 key never crosses the API boundary (RES-92): the bucket
   * is private, presigning happens server-side at read time. URL TTL
   * matches the catalog cache TTL.
   */
  readonly imageUrl: string | null;
  /**
   * Forward-compatible photos array (D-4a-02). Multi-photo gallery UI
   * lands in Phase 5/6; the schema is forward-compatible in 4a. Each
   * entry includes its own presigned GET URL.
   */
  readonly photos: readonly PublishedMenuItemPhoto[];
  readonly allergens: readonly string[];
  readonly sortOrder: number;
  /**
   * Per-100g nutrition values (D-4a-03). Decimal columns serialise as
   * strings via Drizzle `numeric`; `kcal` is an integer; null until a
   * recipe lands or the operator estimates the values.
   */
  readonly proteins: string | null;
  readonly fats: string | null;
  readonly carbs: string | null;
  readonly kcal: number | null;
  readonly nutritionEstimated: boolean;
  /**
   * Item sizes (D-4a CAT-05). Renamed from `variants`; `price` is the
   * absolute per-size price (not a delta on top of `basePrice`).
   */
  readonly sizes: readonly PublishedMenuItemSize[];
  /**
   * Modifier-group ids referenced by this item (D-4a CAT-04). Renamed
   * from `modifierIds`. The actual group payloads are listed in
   * `PublishedMenu.modifierGroups`.
   */
  readonly modifierGroupIds: readonly MenuModifierId[];
}

export interface PublishedMenuCategory {
  readonly id: MenuCategoryId;
  readonly slug: string;
  readonly name: LocalizedText;
  readonly description: LocalizedText | null;
  readonly sortOrder: number;
}

/**
 * Brand identity bundled into the public menu document so the qr-menu
 * can render the right logo, primary color, and font on first paint —
 * no second round-trip to a separate brand endpoint. Null when the
 * request resolved a tenant but no brand (legacy host fallback).
 */
export interface PublishedMenuBrand {
  readonly id: BrandId;
  readonly slug: string;
  readonly displayName: string;
  readonly theme: BrandTheme | null;
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
  readonly brand: PublishedMenuBrand | null;
  readonly categories: readonly PublishedMenuCategory[];
  readonly items: readonly PublishedMenuItem[];
  readonly modifierGroups: readonly PublishedMenuModifierGroup[];
}
