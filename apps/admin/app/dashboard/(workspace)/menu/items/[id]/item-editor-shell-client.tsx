'use client';

import * as React from 'react';
import { AutoSaveIndicator } from '@/components/menu/auto-save-indicator';
import { TenantBreadcrumb } from '@/components/tenant-breadcrumb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fromLocalizedText } from '@/lib/menu/localized';
import type { SaveState } from '@/lib/menu/types';
import type { ItemEditorForm } from '@/lib/menu/zod-schemas';
import { ItemDetailTabClient } from './item-detail-tab-client';
import { ItemSizesTabClient } from './item-sizes-tab-client';
import { ItemModifiersTabClient } from './item-modifiers-tab-client';
import type { CategoryOption, ItemDetailApi, ItemSizeApi } from './types';

export interface ItemEditorShellClientProps {
  readonly initialItem: ItemDetailApi | null;
  readonly categories: readonly CategoryOption[];
  readonly itemId: string;
  readonly defaultCurrency: string;
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

const valuesFromItem = (item: ItemDetailApi): ItemEditorForm =>
  ({
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
  }) as ItemEditorForm;

export function ItemEditorShellClient({
  initialItem,
  categories,
  itemId,
  defaultCurrency,
}: ItemEditorShellClientProps): React.ReactElement {
  const [currentItemId, setCurrentItemId] = React.useState(itemId);
  const [currentPhotoS3Key, setCurrentPhotoS3Key] = React.useState<string | null>(
    initialItem?.photos[0]?.s3Key ?? null,
  );
  const [currentPhotoUrl, setCurrentPhotoUrl] = React.useState<string | null>(
    initialItem?.photos[0]?.url ?? null,
  );
  const [saveState, setSaveState] = React.useState<SaveState>({ kind: 'idle' });
  const [currentSizes, setCurrentSizes] = React.useState<readonly ItemSizeApi[]>(
    initialItem?.sizes ?? [],
  );

  const initialValues = React.useMemo(
    () => (initialItem ? valuesFromItem(initialItem) : emptyValues(defaultCurrency)),
    [initialItem, defaultCurrency],
  );

  const displayName = initialItem ? fromLocalizedText(initialItem.name) : 'Новое блюдо';

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
      <div className="flex items-start justify-between gap-4">
        <TenantBreadcrumb trail={`Меню › Блюда › ${displayName}`} />
        <AutoSaveIndicator state={saveState} />
      </div>

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
            onFirstSave={(newId) => {
              setCurrentItemId(newId);
            }}
            onSaveState={setSaveState}
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
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
