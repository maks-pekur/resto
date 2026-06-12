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
  imageUrl: string | null;
  photos: readonly MenuPhotoDto[];
  allergens: readonly string[];
  proteins: string | null;
  fats: string | null;
  carbs: string | null;
  kcal: number | null;
  nutritionEstimated: boolean;
  sortOrder: number;
  sizes: readonly MenuItemSizeDto[];
  modifierGroupIds: readonly string[];
  isStopListed: boolean;
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
  modifierGroups: readonly MenuModifierGroupDto[];
}
