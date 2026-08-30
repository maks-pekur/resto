import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CategorySelect } from '@/components/menu/category-select';
import { BjuRow, type BjuField } from '@/components/menu/bju-row';
import { ItemSizesCard } from '@/components/menu/item-sizes-card';
import {
  ItemModifierGroupsCard,
  type AvailableGroup,
} from '@/components/menu/item-modifier-groups-card';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { upsertItem } from '@/lib/queries/catalog';
import { itemEditorFormSchema, type ItemEditorForm } from '@/lib/menu/zod-schemas';
import { fromLocalizedText } from '@/lib/menu/localized';
import { LocalizedField } from '@/components/common/localized-field';
import { useContentLocales } from '@/hooks/use-content-locales';
import type { CategoryListItemApi, ItemSizeApi } from '@/lib/queries/catalog';

export interface ItemDetailFormState {
  readonly isNew: boolean;
  readonly isDirty: boolean;
  readonly isPending: boolean;
}

export interface ItemDetailFormProps {
  readonly initialValues: ItemEditorForm;
  readonly categories: readonly CategoryListItemApi[];
  readonly currentItemId: string;
  readonly initialItemSizes: readonly ItemSizeApi[];
  readonly onSizesChange: (sizes: readonly ItemSizeApi[]) => void;
  readonly availableModifierGroups: readonly AvailableGroup[];
  readonly initialModifierGroupIds: readonly string[];
  readonly onSaved: (savedId: string) => void;
  readonly slug: string;
  readonly formId: string;
  readonly onStateChange: (state: ItemDetailFormState) => void;
  readonly currentPhotoS3Key: string | null;
  readonly initialPhotoS3Key: string | null;
}

const commaListFromInput = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

export function ItemDetailForm({
  initialValues,
  categories,
  currentItemId,
  initialItemSizes,
  onSizesChange,
  availableModifierGroups,
  initialModifierGroupIds,
  onSaved,
  slug,
  formId,
  onStateChange,
  currentPhotoS3Key,
  initialPhotoS3Key,
}: ItemDetailFormProps): React.ReactElement {
  const navigate = useNavigate();
  const { t } = useTranslation('translation', { keyPrefix: 'menu.editor' });
  const { t: tCommon } = useTranslation('translation', { keyPrefix: 'common' });
  const queryClient = useQueryClient();
  const [pending, setPending] = React.useState(false);
  const { defaultLocale } = useContentLocales();
  const form = useForm<ItemEditorForm>({
    resolver: zodResolver(itemEditorFormSchema(defaultLocale)),
    defaultValues: initialValues,
    mode: 'onChange',
  });

  const isNew = currentItemId === 'new';
  const isFormDirty = form.formState.isDirty;
  const isPhotoDirty = currentPhotoS3Key !== initialPhotoS3Key;
  const isDirty = isFormDirty || isPhotoDirty;

  React.useEffect(() => {
    onStateChange({ isNew, isDirty, isPending: pending });
  }, [isNew, isDirty, pending, onStateChange]);

  const upsertMutation = useMutation({
    mutationFn: (data: ItemEditorForm & { photoS3Key?: string | null }) =>
      upsertItem(isNew ? null : currentItemId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'items'] });
      if (!isNew) {
        void queryClient.invalidateQueries({
          queryKey: ['catalog', 'item', currentItemId],
        });
      }
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setPending(true);
    try {
      const res = await upsertMutation.mutateAsync({ ...values, photoS3Key: currentPhotoS3Key });
      if (!res.ok) {
        showError(null, t('saveFailed'));
        return;
      }
      showSuccess(isNew ? t('itemCreated') : tCommon('saved'), { duration: 1500 });
      const savedId = res.data?.id ?? '';
      onSaved(savedId);
      if (isNew) {
        void navigate({
          to: '/menu/items/$id',
          params: { id: savedId },
          replace: true,
        });
      } else {
        form.reset(values);
      }
    } finally {
      setPending(false);
    }
  });

  return (
    <FormProvider {...form}>
      <form
        id={formId}
        onSubmit={(e) => {
          void onSubmit(e);
        }}
        className="flex flex-col gap-6"
      >
        <ItemBasicsCard categories={categories} slug={slug} />
        <ItemSizesCard
          itemId={currentItemId}
          sizes={initialItemSizes}
          onSizesChange={onSizesChange}
        />
        <ItemModifierGroupsCard
          itemId={currentItemId}
          initialModifierGroupIds={initialModifierGroupIds}
          availableGroups={availableModifierGroups}
        />
        <ItemNutritionCard />
        <ItemAllergensCard initialAllergens={initialValues.allergens} />
        <ItemSeoCard />
      </form>
    </FormProvider>
  );
}

function ItemBasicsCard({
  categories,
  slug,
}: {
  readonly categories: readonly CategoryListItemApi[];
  readonly slug: string;
}): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.editor' });
  const { defaultLocale, locales } = useContentLocales();
  const form = useFormContext<ItemEditorForm>();
  const categoryOptions = categories.map((c) => ({
    id: c.id,
    name: fromLocalizedText(c.name),
    parentId: c.parentId,
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('basicsSectionTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <FormField
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <LocalizedField
                id="item-name"
                label={t('name')}
                value={field.value}
                onChange={(next) => {
                  field.onChange(next ?? {});
                }}
                onBlur={field.onBlur}
                locales={locales}
                defaultLocale={defaultLocale}
                maxLength={255}
                description={slug || t('slugPlaceholder')}
                {...(fieldState.error ? { error: t('nameRequired') } : {})}
              />
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <LocalizedField
                id="item-description"
                label={t('description')}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                locales={locales}
                defaultLocale={defaultLocale}
                multiline
                nullable
                maxLength={4096}
              />
            )}
          />
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.error ? true : undefined}>
                <FieldLabel htmlFor={field.name}>{t('category')}</FieldLabel>
                <CategorySelect
                  categories={categoryOptions}
                  value={field.value || null}
                  onChange={(v) => {
                    field.onChange(v ?? '');
                  }}
                  mode="item-picker"
                />
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function ItemNutritionCard(): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.editor' });
  const form = useFormContext<ItemEditorForm>();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('nutritionTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldSet>
          <FieldLegend variant="label">{t('nutritionTitle')}</FieldLegend>
          <BjuRow
            proteins={form.watch('proteins')}
            fats={form.watch('fats')}
            carbs={form.watch('carbs')}
            kcal={form.watch('kcal')}
            nutritionEstimated={form.watch('nutritionEstimated')}
            onChange={(name: BjuField, value: number | null) => {
              form.setValue(name, value, { shouldDirty: true, shouldTouch: true });
            }}
          />
        </FieldSet>
      </CardContent>
    </Card>
  );
}

function ItemAllergensCard({
  initialAllergens,
}: {
  readonly initialAllergens: readonly string[];
}): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.editor' });
  const { t: tCommon } = useTranslation('translation', { keyPrefix: 'common' });
  const form = useFormContext<ItemEditorForm>();
  const [allergensText, setAllergensText] = React.useState(initialAllergens.join(', '));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('allergens')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Field>
          <FieldLabel htmlFor="allergens">{t('allergens')}</FieldLabel>
          <Input
            id="allergens"
            value={allergensText}
            placeholder={t('allergensPlaceholder')}
            onChange={(e) => {
              setAllergensText(e.target.value);
              form.setValue('allergens', commaListFromInput(e.target.value), {
                shouldDirty: true,
                shouldTouch: true,
              });
            }}
          />
          <FieldDescription>{tCommon('comma')}</FieldDescription>
        </Field>
      </CardContent>
    </Card>
  );
}

function ItemSeoCard(): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.editor' });
  const form = useFormContext<ItemEditorForm>();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('seoSectionTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <FormField
            control={form.control}
            name="metaTitle"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.error ? true : undefined}>
                <FieldLabel htmlFor={field.name}>{t('metaTitleLabel')}</FieldLabel>
                <Input
                  id={field.name}
                  maxLength={70}
                  aria-invalid={fieldState.error ? true : undefined}
                  value={field.value ?? ''}
                  onChange={(e) => {
                    field.onChange(e.target.value.length === 0 ? null : e.target.value);
                  }}
                  onBlur={field.onBlur}
                  name={field.name}
                />
                <FieldDescription>{t('metaTitleHint')}</FieldDescription>
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />
          <FormField
            control={form.control}
            name="metaDescription"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.error ? true : undefined}>
                <FieldLabel htmlFor={field.name}>{t('metaDescriptionLabel')}</FieldLabel>
                <Textarea
                  id={field.name}
                  maxLength={160}
                  rows={3}
                  aria-invalid={fieldState.error ? true : undefined}
                  value={field.value ?? ''}
                  onChange={(e) => {
                    field.onChange(e.target.value.length === 0 ? null : e.target.value);
                  }}
                  onBlur={field.onBlur}
                  name={field.name}
                />
                <FieldDescription>{t('metaDescriptionHint')}</FieldDescription>
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
