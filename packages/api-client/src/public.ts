import type { paths as allPaths } from './generated/api.js';

export type paths = Pick<allPaths, Extract<keyof allPaths, `/v1/${string}`>>;
export type { components, operations } from './generated/api.js';

export type {
  LocalizedText,
  MenuPhotoDto,
  MenuItemSizeDto,
  MenuModifierOptionDto,
  MenuModifierGroupDto,
  MenuCompositionLineDto,
  MenuItemDto,
  MenuCategoryDto,
  MenuTenantThemeDto,
  MenuTenantDto,
  MenuTenantLocalesDto,
  MenuTenantContactsDto,
  MenuDto,
  OpeningHoursDto,
  OpeningIntervalDto,
  LegalDocumentsDto,
  LegalDocumentKeyDto,
  VenueDto,
  WifiAccessDto,
} from './menu-types.js';
