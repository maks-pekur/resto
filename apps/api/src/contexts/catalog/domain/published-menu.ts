import type {
  Currency,
  LocalizedText,
  MenuCategoryId,
  MenuItemId,
  MenuModifierId,
  MenuVariantId,
  MoneyAmount,
} from '@resto/domain';

// `price` is the ABSOLUTE per-size price, not a delta on base (iiko NPSizePriceModel semantics).
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
  readonly description: LocalizedText | null;
  readonly imageUrl: string | null;
  readonly priceDelta: MoneyAmount;
  readonly freeAmount: number;
  readonly minAmount: number | null;
  readonly maxAmount: number | null;
}

// D-07: a group is display + behaviour + isRequired, never a number. D-03: options are
// tenant-level entities referenced by id — optionIds is the operator's link order.
export interface PublishedMenuModifierGroup {
  readonly id: MenuModifierId;
  readonly name: LocalizedText;
  readonly display: 'tiles' | 'tabs';
  readonly behaviour: 'one' | 'several';
  readonly isRequired: boolean;
  readonly optionIds: readonly string[];
}

export interface PublishedMenuItemPhoto {
  readonly s3Key: string;
  readonly sortOrder: number;
  readonly alt?: string;
  readonly width?: number;
  readonly height?: number;
  readonly isPrimary?: boolean;
  readonly url: string;
}

// D-15: an assembled composition line carries only order position and the removable flag —
// no grams, no unit, no cost.
export interface PublishedMenuCompositionLine {
  readonly optionId: string;
  readonly removable: boolean;
}

export interface PublishedMenuItem {
  readonly id: MenuItemId;
  readonly slug: string;
  readonly categoryId: MenuCategoryId;
  readonly name: LocalizedText;
  readonly description: LocalizedText | null;
  readonly basePrice: MoneyAmount;
  readonly currency: Currency;
  readonly code: string | null;
  readonly weight: string | null;
  readonly measureUnit: 'g' | 'kg' | 'ml' | 'l' | 'pcs' | null;
  readonly imageUrl: string | null;
  readonly photos: readonly PublishedMenuItemPhoto[];
  readonly allergens: readonly string[];
  readonly sortOrder: number;
  readonly proteins: string | null;
  readonly fats: string | null;
  readonly carbs: string | null;
  readonly kcal: number | null;
  readonly sizes: readonly PublishedMenuItemSize[];
  readonly modifierGroupIds: readonly MenuModifierId[];
  readonly extraOptionIds: readonly string[];
  readonly compositionMode: 'text' | 'assembled';
  readonly composition: readonly string[];
  readonly compositionLines: readonly PublishedMenuCompositionLine[];
}

export interface PublishedMenuCategory {
  readonly id: MenuCategoryId;
  readonly slug: string;
  readonly name: LocalizedText;
  readonly description: LocalizedText | null;
  readonly sortOrder: number;
  readonly code: string | null;
}

export interface PublishedMenu {
  readonly tenantId: string;
  readonly version: number;
  readonly currency: Currency;
  readonly categories: readonly PublishedMenuCategory[];
  readonly items: readonly PublishedMenuItem[];
  readonly modifierGroups: readonly PublishedMenuModifierGroup[];
  // D-03/ING-09: every ingredient reachable from a group, a dish's single attachments, or a
  // dish's assembled composition, exactly once — groups and items reference it by id.
  readonly modifierOptions: readonly PublishedMenuModifierOption[];
}
