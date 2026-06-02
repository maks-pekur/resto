'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Textarea } from '@/components/ui/textarea';
import { CategorySelect } from '@/components/menu/category-select';
import { BjuRow, type BjuField } from '@/components/menu/bju-row';
import { ItemEditorFormSchema, type ItemEditorForm } from '@/lib/menu/zod-schemas';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { upsertItemAction } from './upsert-item-action';
import { PhotoUploadClient } from './photo-upload-client';
import type { CategoryOption } from './types';

export interface ItemDetailFormState {
  readonly isNew: boolean;
  readonly isDirty: boolean;
  readonly isPending: boolean;
}

export interface ItemDetailTabClientProps {
  readonly initialValues: ItemEditorForm;
  readonly categories: readonly CategoryOption[];
  readonly currentPhotoS3Key: string | null;
  readonly currentPhotoUrl: string | null;
  readonly initialPhotoS3Key: string | null;
  readonly onPhotoChange: (s3Key: string) => void;
  readonly currentItemId: string;
  readonly onSaved: (savedId: string) => void;
  readonly slug: string;
  readonly formId: string;
  readonly onStateChange: (state: ItemDetailFormState) => void;
}

const allergensFromForm = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

const allergensToText = (allergens: readonly string[]): string => allergens.join(', ');

export function ItemDetailTabClient({
  initialValues,
  categories,
  currentPhotoS3Key,
  currentPhotoUrl,
  initialPhotoS3Key,
  onPhotoChange,
  currentItemId,
  onSaved,
  slug,
  formId,
  onStateChange,
}: ItemDetailTabClientProps): React.ReactElement {
  const router = useRouter();
  const t = useTranslations('menu.editor');
  const tCommon = useTranslations('common');
  const [pending, setPending] = React.useState(false);
  const form = useForm<ItemEditorForm>({
    resolver: zodResolver(ItemEditorFormSchema),
    defaultValues: initialValues,
    mode: 'onChange',
  });

  const [allergensText, setAllergensText] = React.useState(
    allergensToText(initialValues.allergens),
  );

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
    <form
      id={formId}
      onSubmit={(e) => {
        void onSubmit(e);
      }}
      className="flex flex-col gap-6"
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_22rem]">
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

          <FormField
            control={form.control}
            name="basePrice"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.error ? true : undefined}>
                <FieldLabel htmlFor={field.name}>{t('price')}</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id={field.name}
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    aria-invalid={fieldState.error ? true : undefined}
                    name={field.name}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    value={field.value}
                    onChange={(e) => {
                      const n = Number.parseFloat(e.target.value);
                      field.onChange(Number.isFinite(n) ? n : 0);
                    }}
                  />
                  <InputGroupAddon align="inline-end">{form.watch('currency')}</InputGroupAddon>
                </InputGroup>
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />

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

          <Field>
            <FieldLabel htmlFor="allergens">{t('allergens')}</FieldLabel>
            <Input
              id="allergens"
              value={allergensText}
              placeholder={t('allergensPlaceholder')}
              onChange={(e) => {
                setAllergensText(e.target.value);
                form.setValue('allergens', allergensFromForm(e.target.value), {
                  shouldDirty: true,
                  shouldTouch: true,
                });
              }}
            />
            <FieldDescription>{tCommon('comma')}</FieldDescription>
          </Field>
        </FieldGroup>

        <Card>
          <CardHeader>
            <CardTitle>{t('photoTitle')}</CardTitle>
            <CardDescription>{t('photoDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <PhotoUploadClient
              itemId={currentItemId}
              currentS3Key={currentPhotoS3Key}
              currentPhotoUrl={currentPhotoUrl}
              onUploaded={onPhotoChange}
            />
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
