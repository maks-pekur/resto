'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
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
    <Form {...form}>
      <form
        className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem]"
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Название</FormLabel>
                <FormControl>
                  <Input maxLength={255} {...field} />
                </FormControl>
                <p className="text-xs text-muted-foreground">{slug || '—'}</p>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Описание</FormLabel>
                <FormControl>
                  <Textarea
                    maxLength={4096}
                    value={field.value ?? ''}
                    onChange={(e) => {
                      field.onChange(e.target.value.length === 0 ? null : e.target.value);
                    }}
                    onBlur={field.onBlur}
                    name={field.name}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Категория</FormLabel>
                <FormControl>
                  <CategorySelect
                    categories={categories}
                    value={field.value || null}
                    onChange={(v) => {
                      field.onChange(v ?? '');
                    }}
                    mode="item-picker"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-[8rem_1fr] items-end gap-3">
            <FormField
              control={form.control}
              name="basePrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Цена</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      name={field.name}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      value={field.value ?? 0}
                      onChange={(e) => {
                        const n = Number.parseFloat(e.target.value);
                        field.onChange(Number.isFinite(n) ? n : 0);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="sr-only">Валюта</FormLabel>
                  <FormControl>
                    <Input
                      readOnly
                      aria-readonly="true"
                      className="bg-muted text-muted-foreground"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <BjuRow
            proteins={form.watch('proteins')}
            fats={form.watch('fats')}
            carbs={form.watch('carbs')}
            kcal={form.watch('kcal')}
            nutritionEstimated={form.watch('nutritionEstimated')}
            onChange={(field: BjuField, value: number | null) => {
              form.setValue(field, value, { shouldDirty: true, shouldTouch: true });
            }}
          />

          <FormItem>
            <FormLabel>Аллергены</FormLabel>
            <FormControl>
              <Input
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
            </FormControl>
            <p className="text-xs text-muted-foreground">Через запятую</p>
          </FormItem>
        </div>

        <PhotoUploadClient
          itemId={currentItemId}
          currentS3Key={currentPhotoS3Key}
          currentPhotoUrl={currentPhotoUrl}
          onUploaded={onPhotoChange}
        />
      </form>
    </Form>
  );
}
