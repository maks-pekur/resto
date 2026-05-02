/**
 * Shape of `/v1/menu` as the api emits it (see `apps/api/src/contexts/
 * catalog/domain/published-menu.ts`). Replicated here as a wire shape —
 * the qr-menu must not import from the api or `@resto/domain` at
 * runtime to keep the bundle small.
 */
export type LocalizedText = Record<string, string>;

export interface MenuVariantDto {
  id: string;
  name: LocalizedText;
  priceDelta: string;
  isDefault: boolean;
  sortOrder: number;
}

export interface MenuItemDto {
  id: string;
  slug: string;
  categoryId: string;
  name: LocalizedText;
  description: LocalizedText | null;
  basePrice: string;
  currency: string;
  imageS3Key: string | null;
  allergens: readonly string[];
  sortOrder: number;
  variants: readonly MenuVariantDto[];
  modifierIds: readonly string[];
}

export interface MenuCategoryDto {
  id: string;
  slug: string;
  name: LocalizedText;
  description: LocalizedText | null;
  sortOrder: number;
}

export interface MenuDto {
  tenantId: string;
  version: number;
  currency: string;
  categories: readonly MenuCategoryDto[];
  items: readonly MenuItemDto[];
  modifiers: readonly unknown[];
}
