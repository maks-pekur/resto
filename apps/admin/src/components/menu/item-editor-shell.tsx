import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { PageHeading } from '@/components/common/page-heading';
import { ItemDetailForm, type ItemDetailFormState } from '@/components/menu/item-detail-form';
import { ItemAside } from '@/components/menu/item-aside';
import type { AvailableGroup } from '@/components/menu/item-modifier-groups-card';
import type { CategoryListItemApi, ItemDetailApi, ItemSizeApi } from '@/lib/queries/catalog';
import type { ItemEditorForm } from '@/lib/menu/zod-schemas';

export interface ItemEditorShellProps {
  readonly title: string;
  readonly initialItem: ItemDetailApi | null;
  readonly categories: readonly CategoryListItemApi[];
  readonly itemId: string;
  readonly defaultCurrency: string;
  readonly availableModifierGroups: readonly AvailableGroup[];
}

const ITEM_FORM_ID = 'item-form';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

const emptyValues = (currency: string): ItemEditorForm => ({
  name: {},
  description: null,
  categoryId: NIL_UUID,
  basePrice: 0,
  currency,
  allergens: [],
  diets: [],
  compositionMode: 'text',
  compositionText: [],
  compositionAssembled: [],
  metaTitle: null,
  metaDescription: null,
  proteins: null,
  fats: null,
  carbs: null,
  kcal: null,
});

const valuesFromItem = (item: ItemDetailApi): ItemEditorForm => ({
  name: { ...item.name },
  description: item.description ? { ...item.description } : null,
  categoryId: item.categoryId,
  basePrice: Number.parseFloat(item.basePrice),
  currency: item.currency,
  allergens: [...(item.allergens ?? [])],
  diets: [...(item.diets ?? [])],
  compositionMode: item.compositionMode,
  compositionText: [...(item.composition ?? [])],
  compositionAssembled: item.compositionAssembled.map((line) => ({ ...line })),
  // Plain strings in the contract, unlike `name`/`description` — the api stores one SEO
  // string per item, not one per locale. They were being run through fromLocalizedText.
  metaTitle: item.metaTitle,
  metaDescription: item.metaDescription,
  proteins: item.proteins,
  fats: item.fats,
  carbs: item.carbs,
  kcal: item.kcal,
});

export function ItemEditorShell({
  title,
  initialItem,
  categories,
  itemId,
  defaultCurrency,
  availableModifierGroups,
}: ItemEditorShellProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.editor' });
  const { t: tCommon } = useTranslation('translation', { keyPrefix: 'common' });
  const [currentItemId, setCurrentItemId] = React.useState(itemId);
  // The contract carries `photos: [{ s3Key, sortOrder }]`; `photoS3Key` and `photoUrl`
  // never existed on the response. Reading the phantom key meant the editor always
  // started with "no photo" and then saved that emptiness over the real one.
  const initialPhotoS3Key = initialItem?.photos[0]?.s3Key ?? null;
  const [currentPhotoS3Key, setCurrentPhotoS3Key] = React.useState<string | null>(
    initialPhotoS3Key,
  );
  // Reads carry a short-lived presigned url beside the key; the key is what goes back
  // on save, the url is only for the preview.
  const [currentPhotoUrl, setCurrentPhotoUrl] = React.useState<string | null>(
    initialItem?.photos[0]?.url ?? null,
  );
  const [currentSizes, setCurrentSizes] = React.useState<readonly ItemSizeApi[]>(
    initialItem?.sizes ?? [],
  );
  const [detailState, setDetailState] = React.useState<ItemDetailFormState>({
    isNew: itemId === 'new',
    isDirty: false,
    isPending: false,
  });

  const initialValues = React.useMemo(
    () => (initialItem ? valuesFromItem(initialItem) : emptyValues(defaultCurrency)),
    [initialItem, defaultCurrency],
  );

  const handleDetailStateChange = React.useCallback((next: ItemDetailFormState) => {
    setDetailState(next);
  }, []);

  const canSubmitDetail = detailState.isNew || detailState.isDirty;
  const saveLabel = detailState.isPending
    ? tCommon('saving')
    : detailState.isNew
      ? t('createBtn')
      : tCommon('save');

  const saveButton = (
    <Button
      type="submit"
      form={ITEM_FORM_ID}
      size="sm"
      disabled={detailState.isPending || !canSubmitDetail}
    >
      {saveLabel}
    </Button>
  );

  return (
    <>
      <PageHeading title={title} action={saveButton} />
      <div className="flex flex-1 flex-col px-4 lg:px-6">
        <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
          <div className="flex flex-col gap-6">
            <ItemDetailForm
              initialValues={initialValues}
              categories={categories}
              currentItemId={currentItemId}
              initialItemSizes={currentSizes}
              onSizesChange={setCurrentSizes}
              availableModifierGroups={availableModifierGroups}
              initialModifierGroupIds={initialItem?.modifierGroupIds ?? []}
              initialIngredientIds={initialItem?.modifierOptionIds ?? []}
              onSaved={(savedId) => {
                setCurrentItemId(savedId);
              }}
              slug={initialItem?.slug ?? ''}
              formId={ITEM_FORM_ID}
              onStateChange={handleDetailStateChange}
              currentPhotoS3Key={currentPhotoS3Key}
              initialPhotoS3Key={initialPhotoS3Key}
            />
          </div>
          <aside className="lg:sticky lg:top-[calc(var(--header-height)+1rem)] lg:self-start">
            <ItemAside
              itemId={currentItemId}
              currentPhotoS3Key={currentPhotoS3Key}
              currentPhotoUrl={currentPhotoUrl}
              onPhotoChange={(s3Key) => {
                setCurrentPhotoS3Key(s3Key);
                setCurrentPhotoUrl(null);
              }}
              status={initialItem?.status ?? 'draft'}
              slug={initialItem?.slug ?? ''}
            />
          </aside>
        </div>
      </div>
    </>
  );
}
