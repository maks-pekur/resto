/**
 * Shape of `/v1/menu` as the api emits it (see `apps/api/src/contexts/
 * catalog/domain/published-menu.ts`). Replicated here as a wire shape —
 * the qr-menu must not import from the api or `@resto/domain` at
 * runtime to keep the bundle small.
 */
export type LocalizedText = Record<string, string>;

export interface MenuPhotoDto {
  readonly s3Key: string;
  readonly url: string;
  readonly sortOrder: number;
  readonly alt?: string;
  readonly width?: number;
  readonly height?: number;
  readonly isPrimary?: boolean;
}

export interface MenuItemSizeDto {
  readonly id: string;
  readonly name: LocalizedText;
  /** Absolute price for this size (iiko-aligned per CAT-04). */
  readonly price: string;
  readonly isDefault: boolean;
  readonly sortOrder: number;
}

export interface MenuModifierOptionDto {
  readonly id: string;
  readonly name: LocalizedText;
  readonly priceDelta: string;
  readonly defaultAmount: number;
  readonly freeAmount: number;
  readonly sortOrder: number;
}

export interface MenuModifierGroupDto {
  readonly id: string;
  readonly name: LocalizedText;
  readonly minSelectable: number;
  readonly maxSelectable: number;
  readonly isRequired: boolean;
  readonly options: readonly MenuModifierOptionDto[];
}

export interface MenuItemDto {
  id: string;
  slug: string;
  categoryId: string;
  name: LocalizedText;
  description: LocalizedText | null;
  basePrice: string;
  currency: string;
  /**
   * Short-lived presigned GET URL for the item image, or `null` if the
   * item has no photo. The api never returns the raw S3 key (RES-92).
   * This is `photos[0]?.url` projected for backward compatibility with
   * v1 qr-menu callers.
   */
  imageUrl: string | null;
  /**
   * Full photo gallery (CAT-02 — multi-photo + alt text + ordering). All
   * URLs are short-lived presigned GET links; the raw S3 key is never
   * exposed.
   */
  photos: readonly MenuPhotoDto[];
  allergens: readonly string[];
  /** CAT-02 nutrition columns. `null` when the operator hasn't filled them in. */
  proteins: string | null;
  fats: string | null;
  carbs: string | null;
  kcal: number | null;
  /** `true` when the BJU figures were auto-estimated (D-4a-02). */
  nutritionEstimated: boolean;
  sortOrder: number;
  /** Iiko-aligned per-item sizes (renamed from `variants`, CAT-04). */
  sizes: readonly MenuItemSizeDto[];
  /**
   * Iiko-aligned modifier-group ids attached to this item. The full
   * group + option shape is at `MenuDto.modifierGroups`.
   */
  modifierGroupIds: readonly string[];
}

export interface MenuCategoryDto {
  id: string;
  slug: string;
  name: LocalizedText;
  description: LocalizedText | null;
  sortOrder: number;
}

export interface MenuBrandThemeDto {
  readonly logoUrl: string | null;
  readonly primaryColor: string | null;
  readonly font: string | null;
}

export interface MenuBrandDto {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
  readonly theme: MenuBrandThemeDto | null;
}

export interface MenuDto {
  tenantId: string;
  version: number;
  currency: string;
  brand: MenuBrandDto | null;
  categories: readonly MenuCategoryDto[];
  items: readonly MenuItemDto[];
  /** Full modifier-group catalog (renamed from `modifiers`, CAT-05). */
  modifierGroups: readonly MenuModifierGroupDto[];
}
