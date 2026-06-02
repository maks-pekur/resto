'use client';

// Render contract: this component is the SOLE owner of the RHF FormProvider for the item editor.
// Child cards (ItemSizesCardClient, ItemModifierGroupsCardClient) rely on useFormContext() and MUST be
// rendered as descendants of this component, never composed by the shell directly.

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { ItemEditorFormSchema, type ItemEditorForm } from '@/lib/menu/zod-schemas';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { upsertItemAction } from './upsert-item-action';
import { ItemSizesCardClient } from './item-sizes-card-client';
import {
  ItemModifierGroupsCardClient,
  type AvailableGroup,
} from './item-modifier-groups-card-client';
import type { CategoryOption, ItemSizeApi } from './types';

export interface ItemDetailFormState {
  readonly isNew: boolean;
  readonly isDirty: boolean;
  readonly isPending: boolean;
}

export interface ItemDetailFormClientProps {
  readonly initialValues: ItemEditorForm;
  readonly categories: readonly CategoryOption[];
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

export function ItemDetailFormClient({
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
}: ItemDetailFormClientProps): React.ReactElement {
  const router = useRouter();
  const t = useTranslations('menu.editor');
  const tCommon = useTranslations('common');
  const [pending, setPending] = React.useState(false);
  const form = useForm<ItemEditorForm>({
    resolver: zodResolver(ItemEditorFormSchema),
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

  const onSubmit = form.handleSubmit(async (values) => {
    setPending(true);
    const res = await upsertItemAction(currentItemId, values, currentPhotoS3Key);
    setPending(false);
    if (!res.ok) {
      showError(res.error, t('saveFailed'));
      return;
    }
    showSuccess(isNew ? t('itemCreated') : tCommon('saved'), { duration: 1500 });
    onSaved(res.id);
    if (isNew) {
      router.replace(`/dashboard/menu/items/${res.id}`);
    } else {
      form.reset(values);
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
        <ItemSizesCardClient
          itemId={currentItemId}
          sizes={initialItemSizes}
          onSizesChange={onSizesChange}
        />
        <ItemModifierGroupsCardClient
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
  readonly categories: readonly CategoryOption[];
  readonly slug: string;
}): React.ReactElement {
  const t = useTranslations('menu.editor');
  const form = useFormContext<ItemEditorForm>();
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
              <Field data-invalid={fieldState.error ? true : undefined}>
                <FieldLabel htmlFor={field.name}>{t('name')}</FieldLabel>
                <Input
                  id={field.name}
                  maxLength={255}
                  aria-invalid={fieldState.error ? true : undefined}
                  {...field}
                />
                <FieldDescription>{slug || t('slugPlaceholder')}</FieldDescription>
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.error ? true : undefined}>
                <FieldLabel htmlFor={field.name}>{t('description')}</FieldLabel>
                <Textarea
                  id={field.name}
                  maxLength={4096}
                  rows={4}
                  aria-invalid={fieldState.error ? true : undefined}
                  value={field.value ?? ''}
                  onChange={(e) => {
                    field.onChange(e.target.value.length === 0 ? null : e.target.value);
                  }}
                  onBlur={field.onBlur}
                  name={field.name}
                />
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.error ? true : undefined}>
                <FieldLabel htmlFor={field.name}>{t('category')}</FieldLabel>
                <CategorySelect
                  categories={categories}
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
  const t = useTranslations('menu.editor');
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
  const t = useTranslations('menu.editor');
  const tCommon = useTranslations('common');
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
  const t = useTranslations('menu.editor');
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
