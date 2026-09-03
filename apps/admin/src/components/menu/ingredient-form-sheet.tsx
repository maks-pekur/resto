import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PhotoUpload } from '@/components/menu/photo-upload';
import { LocalizedField } from '@/components/common/localized-field';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { fromLocalizedText } from '@/lib/menu/localized';
import { useContentLocales } from '@/hooks/use-content-locales';
import { archiveIngredient, ingredientUsageQuery, upsertIngredient } from '@/lib/queries/catalog';
import { ingredientFormSchema, type IngredientForm } from '@/lib/menu/zod-schemas';
import type { IngredientApi, IngredientUsageApi } from '@/lib/queries/catalog';

export interface IngredientFormSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly ingredient: IngredientApi | null;
}

const buildDefaults = (
  ingredient: IngredientApi | null,
  defaultLocale: string,
): IngredientForm => ({
  name: ingredient ? { ...ingredient.name } : {},
  description: ingredient ? fromLocalizedText(ingredient.description, defaultLocale) || null : null,
  priceDelta: ingredient ? Number.parseFloat(ingredient.priceDelta) : 0,
  imageS3Key: null,
});

const dishUnion = (usage: IngredientUsageApi | null, defaultLocale: string): readonly string[] => {
  if (!usage) return [];
  const byId = new Map<string, string>();
  for (const dish of [...usage.dishesAttached, ...usage.dishesInComposition]) {
    byId.set(dish.id, fromLocalizedText(dish.name, defaultLocale));
  }
  return [...byId.values()];
};

export function IngredientFormSheet({
  open,
  onOpenChange,
  ingredient,
}: IngredientFormSheetProps): React.ReactElement {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-4 overflow-y-auto">
        {open ? (
          <IngredientFormSheetBody
            key={ingredient?.id ?? 'new'}
            ingredient={ingredient}
            onClose={() => {
              onOpenChange(false);
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

interface IngredientFormSheetBodyProps {
  readonly ingredient: IngredientApi | null;
  readonly onClose: () => void;
}

function IngredientFormSheetBody({
  ingredient,
  onClose,
}: IngredientFormSheetBodyProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.ingredients' });
  const { t: tCommon } = useTranslation('translation', { keyPrefix: 'common' });
  const { defaultLocale, locales } = useContentLocales();
  const queryClient = useQueryClient();
  const isNew = ingredient === null;
  const [archiveOpen, setArchiveOpen] = React.useState(false);

  const form = useForm<IngredientForm>({
    resolver: zodResolver(ingredientFormSchema(defaultLocale)),
    defaultValues: buildDefaults(ingredient, defaultLocale),
  });

  const usageQuery = useQuery({
    ...ingredientUsageQuery(ingredient?.id ?? ''),
    enabled: !isNew,
  });
  const usage = usageQuery.data?.data ?? null;

  const saveMutation = useMutation({
    mutationFn: (values: IngredientForm) => {
      const description =
        values.description && values.description.trim().length > 0
          ? { [defaultLocale]: values.description.trim() }
          : null;
      return upsertIngredient(ingredient === null ? null : ingredient.id, {
        name: values.name,
        description,
        priceDelta: values.priceDelta,
        imageS3Key: values.imageS3Key,
      });
    },
    onSuccess: (res) => {
      if (!res.ok) {
        showError(null, t('saveFailed'));
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'ingredients'] });
      showSuccess(tCommon('saved'), { duration: 1500 });
      onClose();
    },
    onError: () => {
      showError(null, t('saveFailed'));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveIngredient(id),
    onSuccess: (res) => {
      if (!res.ok) {
        showError(null, t('saveFailed'));
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'ingredients'] });
      setArchiveOpen(false);
      onClose();
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    saveMutation.mutate(values);
  });

  const ingredientName = ingredient ? fromLocalizedText(ingredient.name, defaultLocale) : '';
  const groupNames = (usage?.groups ?? []).map((g) => fromLocalizedText(g.name, defaultLocale));
  const dishNames = dishUnion(usage, defaultLocale);

  return (
    <>
      <SheetHeader>
        <SheetTitle>{isNew ? t('editorTitleNew') : t('editorTitleEdit')}</SheetTitle>
      </SheetHeader>
      <form
        id="ingredient-form"
        onSubmit={(e) => {
          void onSubmit(e);
        }}
        className="flex flex-1 flex-col gap-6 overflow-y-auto px-4"
      >
        <FieldGroup>
          <PhotoUpload
            itemId={ingredient?.id ?? 'new'}
            currentS3Key={null}
            currentPhotoUrl={ingredient?.imageUrl ?? null}
            kind="ingredient"
            onUploaded={(s3Key) => {
              form.setValue('imageS3Key', s3Key, { shouldDirty: true });
            }}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <LocalizedField
                id="ingredient-name"
                label={t('nameLabel')}
                value={field.value}
                onChange={(next) => {
                  field.onChange(next ?? {});
                }}
                onBlur={field.onBlur}
                locales={locales}
                defaultLocale={defaultLocale}
                maxLength={255}
                {...(fieldState.error ? { error: t('nameRequired') } : {})}
              />
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.error ? true : undefined}>
                <FieldLabel htmlFor="ingredient-description">{t('descriptionLabel')}</FieldLabel>
                <Input
                  id="ingredient-description"
                  placeholder={t('descriptionPlaceholder')}
                  maxLength={140}
                  name={field.name}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  value={field.value ?? ''}
                  onChange={(e) => {
                    field.onChange(e.target.value.length > 0 ? e.target.value : null);
                  }}
                />
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />
          <FormField
            control={form.control}
            name="priceDelta"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.error ? true : undefined}>
                <FieldLabel htmlFor="ingredient-price">{t('priceLabel')}</FieldLabel>
                <Input
                  id="ingredient-price"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  min={0}
                  name={field.name}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  value={field.value}
                  onChange={(e) => {
                    const n = Number.parseFloat(e.target.value);
                    field.onChange(Number.isFinite(n) ? n : 0);
                  }}
                />
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />
        </FieldGroup>

        {!isNew ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="w-fit"
            onClick={() => {
              setArchiveOpen(true);
            }}
          >
            {t('archiveBtn')}
          </Button>
        ) : null}
      </form>

      <SheetFooter className="flex-row justify-end">
        <Button type="button" variant="ghost" onClick={onClose}>
          {tCommon('cancel')}
        </Button>
        <Button type="submit" form="ingredient-form" disabled={saveMutation.isPending}>
          {isNew ? t('createBtn') : t('saveBtn')}
        </Button>
      </SheetFooter>

      {ingredient !== null ? (
        <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('archiveDialogTitle')}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="flex flex-col gap-2 text-left">
                  <p>
                    {t('archiveDialogDescription', {
                      name: ingredientName,
                      groupCount: groupNames.length,
                      dishCount: dishNames.length,
                    })}
                  </p>
                  {groupNames.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t('usedInGroups', { names: groupNames.join(', ') })}
                    </p>
                  ) : null}
                  {dishNames.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t('usedInDishes', { names: dishNames.join(', ') })}
                    </p>
                  ) : null}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  archiveMutation.mutate(ingredient.id);
                }}
              >
                {t('archiveBtn')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}
