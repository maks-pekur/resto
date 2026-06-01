'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
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
import { useDebouncedAutosave } from '@/lib/menu/use-auto-save';
import { ItemEditorFormSchema, type ItemEditorForm } from '@/lib/menu/zod-schemas';
import type { SaveState } from '@/lib/menu/types';
import { upsertItemAction } from './upsert-item-action';
import { PhotoUploadClient } from './photo-upload-client';
import type { CategoryOption } from './types';

export interface ItemDetailTabClientProps {
  readonly initialValues: ItemEditorForm;
  readonly categories: readonly CategoryOption[];
  readonly currentPhotoS3Key: string | null;
  readonly currentPhotoUrl: string | null;
  readonly onPhotoChange: (s3Key: string) => void;
  readonly currentItemId: string;
  readonly onFirstSave: (newId: string) => void;
  readonly onSaveState: (state: SaveState) => void;
  readonly slug: string;
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
  onPhotoChange,
  currentItemId,
  onFirstSave,
  onSaveState,
  slug,
}: ItemDetailTabClientProps): React.ReactElement {
  const router = useRouter();
  const form = useForm<ItemEditorForm>({
    resolver: zodResolver(ItemEditorFormSchema),
    defaultValues: initialValues,
    mode: 'onChange',
  });

  const [allergensText, setAllergensText] = React.useState(
    allergensToText(initialValues.allergens),
  );

  useDebouncedAutosave<ItemEditorForm>(
    form,
    async (values) => {
      const res = await upsertItemAction(currentItemId, values, currentPhotoS3Key);
      if (res.ok && currentItemId === 'new') {
        onFirstSave(res.id);
        router.replace(`/dashboard/menu/items/${res.id}`);
      }
      return { ok: res.ok };
    },
    onSaveState,
  );

  return (
    <form
      className="grid gap-6 md:grid-cols-[minmax(0,1fr)_22rem]"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <FieldGroup>
        <FormField
          control={form.control}
          name="name"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.error ? true : undefined}>
              <FieldLabel htmlFor={field.name}>Название</FieldLabel>
              <Input
                id={field.name}
                maxLength={255}
                aria-invalid={fieldState.error ? true : undefined}
                {...field}
              />
              <FieldDescription>{slug || 'Slug определится после сохранения'}</FieldDescription>
              {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
            </Field>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.error ? true : undefined}>
              <FieldLabel htmlFor={field.name}>Описание</FieldLabel>
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
              <FieldLabel htmlFor={field.name}>Категория</FieldLabel>
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
              <FieldLabel htmlFor={field.name}>Цена</FieldLabel>
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
          <FieldLegend variant="label">Питание на 100 г</FieldLegend>
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
          <FieldLabel htmlFor="allergens">Аллергены</FieldLabel>
          <Input
            id="allergens"
            value={allergensText}
            placeholder="Молоко, орехи, глютен"
            onChange={(e) => {
              setAllergensText(e.target.value);
              form.setValue('allergens', allergensFromForm(e.target.value), {
                shouldDirty: true,
                shouldTouch: true,
              });
            }}
          />
          <FieldDescription>Через запятую</FieldDescription>
        </Field>
      </FieldGroup>

      <Card>
        <CardHeader>
          <CardTitle>Фото блюда</CardTitle>
          <CardDescription>JPG, PNG, WEBP до 5 МБ</CardDescription>
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
    </form>
  );
}
