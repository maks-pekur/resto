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
  weight: string | null;
  measureUnit: 'g' | 'kg' | 'ml' | 'l' | 'pcs' | null;
  imageUrl: string | null;
  photos: readonly MenuPhotoDto[];
  allergens: readonly string[];
  diets: readonly string[];
  proteins: string | null;
  fats: string | null;
  carbs: string | null;
  kcal: number | null;
  sortOrder: number;
  sizes: readonly MenuItemSizeDto[];
  modifierGroupIds: readonly string[];
}

export interface MenuCategoryDto {
  id: string;
  slug: string;
  name: LocalizedText;
  description: LocalizedText | null;
  sortOrder: number;
}

export interface MenuTenantThemeDto {
  readonly logoUrl: string | null;
  readonly coverUrls: readonly string[];
  readonly primaryColor: string | null;
  readonly font: string | null;
}

export interface OpeningIntervalDto {
  readonly from: string;
  readonly to: string;
}

/** Intervals per weekday; an empty day is a closed day. */
export type OpeningHoursDto = Readonly<Record<string, readonly OpeningIntervalDto[]>>;

export interface WifiAccessDto {
  readonly ssid: string;
  readonly password: string | null;
}

export type LegalDocumentKeyDto = 'about' | 'payment' | 'returns' | 'cookies' | 'terms' | 'privacy';

export type LegalDocumentsDto = Readonly<Record<LegalDocumentKeyDto, LocalizedText | null>>;

/** The point the guest is sitting in — hours and wi-fi are per address, not per company. */
export interface VenueDto {
  readonly locationId: string | null;
  readonly name: string | null;
  readonly address: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly phone: string | null;
  readonly openingHours: OpeningHoursDto | null;
  readonly wifi: WifiAccessDto | null;
}

export interface MenuTenantLocalesDto {
  readonly default: string;
  readonly supported: readonly string[];
}

export interface MenuTenantContactsDto {
  readonly phone: string | null;
  readonly email: string | null;
  readonly website: string | null;
}

export interface MenuTenantDto {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
  readonly description: LocalizedText | null;
  readonly socials: Readonly<Record<string, string>>;
  readonly contacts: MenuTenantContactsDto;
  readonly theme: MenuTenantThemeDto | null;
  readonly locales: MenuTenantLocalesDto;
}

export interface MenuDto {
  tenantId: string;
  version: number;
  currency: string;
  tenant: MenuTenantDto | null;
  categories: readonly MenuCategoryDto[];
  items: readonly MenuItemDto[];
  modifierGroups: readonly MenuModifierGroupDto[];
}
