'use client';

import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fromLocalizedText } from '@/lib/menu/localized';
import type { ItemEditorForm } from '@/lib/menu/zod-schemas';
import { ItemDetailTabClient } from './item-detail-tab-client';
import { ItemSizesTabClient } from './item-sizes-tab-client';
import { ItemModifiersTabClient, type AvailableGroup } from './item-modifiers-tab-client';
import type { CategoryOption, ItemDetailApi, ItemSizeApi } from './types';

export interface ItemEditorShellClientProps {
  readonly initialItem: ItemDetailApi | null;
  readonly categories: readonly CategoryOption[];
  readonly itemId: string;
  readonly defaultCurrency: string;
  readonly availableModifierGroups: readonly AvailableGroup[];
}

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

const emptyValues = (currency: string): ItemEditorForm => ({
  name: '',
  description: null,
  categoryId: NIL_UUID,
  basePrice: 0,
  currency,
  allergens: [],
  proteins: null,
  fats: null,
  carbs: null,
  kcal: null,
  nutritionEstimated: false,
});

const valuesFromItem = (item: ItemDetailApi): ItemEditorForm => ({
  name: fromLocalizedText(item.name),
  description: item.description ? fromLocalizedText(item.description) : null,
  categoryId: item.categoryId,
  basePrice: Number.parseFloat(item.basePrice),
  currency: item.currency,
  allergens: [...item.allergens],
  proteins: item.proteins,
  fats: item.fats,
  carbs: item.carbs,
  kcal: item.kcal,
  nutritionEstimated: item.nutritionEstimated,
});

export function ItemEditorShellClient({
  initialItem,
  categories,
  itemId,
  defaultCurrency,
  availableModifierGroups,
}: ItemEditorShellClientProps): React.ReactElement {
  const [currentItemId, setCurrentItemId] = React.useState(itemId);
  const initialPhotoS3Key = initialItem?.photos[0]?.s3Key ?? null;
  const [currentPhotoS3Key, setCurrentPhotoS3Key] = React.useState<string | null>(
    initialPhotoS3Key,
  );
  const [currentPhotoUrl, setCurrentPhotoUrl] = React.useState<string | null>(
    initialItem?.photos[0]?.url ?? null,
  );
  const [currentSizes, setCurrentSizes] = React.useState<readonly ItemSizeApi[]>(
    initialItem?.sizes ?? [],
  );

  const initialValues = React.useMemo(
    () => (initialItem ? valuesFromItem(initialItem) : emptyValues(defaultCurrency)),
    [initialItem, defaultCurrency],
  );

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
      <Tabs defaultValue="detail" className="flex-1">
        <TabsList>
          <TabsTrigger value="detail">Детали</TabsTrigger>
          <TabsTrigger value="sizes">Размеры</TabsTrigger>
          <TabsTrigger value="modifiers">Модификаторы</TabsTrigger>
        </TabsList>

        <TabsContent value="detail" forceMount className="data-[state=inactive]:hidden">
          <ItemDetailTabClient
            initialValues={initialValues}
            categories={categories}
            currentPhotoS3Key={currentPhotoS3Key}
            currentPhotoUrl={currentPhotoUrl}
            onPhotoChange={(s3Key) => {
              setCurrentPhotoS3Key(s3Key);
              setCurrentPhotoUrl(null);
            }}
            currentItemId={currentItemId}
            initialPhotoS3Key={initialPhotoS3Key}
            onSaved={(savedId) => {
              setCurrentItemId(savedId);
            }}
            slug={initialItem?.slug ?? ''}
          />
        </TabsContent>

        <TabsContent value="sizes" forceMount className="data-[state=inactive]:hidden">
          <ItemSizesTabClient
            itemId={currentItemId}
            sizes={currentSizes}
            onSizesChange={setCurrentSizes}
          />
        </TabsContent>

        <TabsContent value="modifiers" forceMount className="data-[state=inactive]:hidden">
          <ItemModifiersTabClient
            itemId={currentItemId}
            initialModifierGroupIds={initialItem?.modifierGroupIds ?? []}
            availableGroups={availableModifierGroups}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
