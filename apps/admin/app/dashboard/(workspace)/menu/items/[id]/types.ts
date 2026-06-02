import type { Status } from '@/lib/menu/types';

export interface ItemPhotoApi {
  readonly s3Key: string;
  readonly sortOrder: number;
  readonly isPrimary: boolean;
  readonly url?: string;
}

export interface ItemSizeApi {
  readonly id: string;
  readonly name: Record<string, string>;
  readonly price: string;
  readonly isDefault: boolean;
}

export interface ItemDetailApi {
  readonly id: string;
  readonly name: Record<string, string>;
  readonly description: Record<string, string> | null;
  readonly categoryId: string;
  readonly basePrice: string;
  readonly currency: string;
  readonly allergens: readonly string[];
  readonly ingredients: readonly string[] | null;
  readonly metaTitle: string | null;
  readonly metaDescription: string | null;
  readonly proteins: number | null;
  readonly fats: number | null;
  readonly carbs: number | null;
  readonly kcal: number | null;
  readonly nutritionEstimated: boolean;
  readonly source: 'manual' | 'ai_generated' | 'imported_iiko' | 'imported_csv';
  readonly photos: readonly ItemPhotoApi[];
  readonly slug: string;
  readonly status: Status;
  readonly sizes: readonly ItemSizeApi[];
  readonly modifierGroupIds: readonly string[];
}

export interface CategoryOption {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
}
