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
import { archiveModifier, modifierUsageQuery, upsertModifier } from '@/lib/queries/catalog';
import { modifierFormSchema, type ModifierForm } from '@/lib/menu/zod-schemas';
import type { ModifierApi, ModifierUsageApi } from '@/lib/queries/catalog';

export interface ModifierFormSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly modifier: ModifierApi | null;
}

const buildDefaults = (modifier: ModifierApi | null, defaultLocale: string): ModifierForm => ({
  name: modifier ? { ...modifier.name } : {},
  description: modifier ? fromLocalizedText(modifier.description, defaultLocale) || null : null,
  priceDelta: modifier ? Number.parseFloat(modifier.priceDelta) : 0,
  imageS3Key: modifier ? modifier.imageS3Key : null,
});

const dishUnion = (usage: ModifierUsageApi | null, defaultLocale: string): readonly string[] => {
  if (!usage) return [];
  const byId = new Map<string, string>();
  for (const dish of [...usage.dishesAttached, ...usage.dishesInComposition]) {
    byId.set(dish.id, fromLocalizedText(dish.name, defaultLocale));
  }
  return [...byId.values()];
};

export function ModifierFormSheet({
  open,
  onOpenChange,
  modifier,
}: ModifierFormSheetProps): React.ReactElement {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-4 overflow-y-auto">
        {open ? (
          <ModifierFormSheetBody
            key={modifier?.id ?? 'new'}
            modifier={modifier}
            onClose={() => {
              onOpenChange(false);
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

interface ModifierFormSheetBodyProps {
  readonly modifier: ModifierApi | null;
  readonly onClose: () => void;
}

function ModifierFormSheetBody({
  modifier,
  onClose,
}: ModifierFormSheetBodyProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.modifiers' });
  const { t: tCommon } = useTranslation('translation', { keyPrefix: 'common' });
  const { defaultLocale, locales } = useContentLocales();
  const queryClient = useQueryClient();
  const isNew = modifier === null;
  const [archiveOpen, setArchiveOpen] = React.useState(false);

  const form = useForm<ModifierForm>({
    resolver: zodResolver(modifierFormSchema(defaultLocale)),
    defaultValues: buildDefaults(modifier, defaultLocale),
  });

  const usageQuery = useQuery({
    ...modifierUsageQuery(modifier?.id ?? ''),
    enabled: !isNew,
  });
  const usage = usageQuery.data?.data ?? null;

  const saveMutation = useMutation({
    mutationFn: (values: ModifierForm) => {
      const description =
        values.description && values.description.trim().length > 0
          ? { [defaultLocale]: values.description.trim() }
          : null;
      return upsertModifier(modifier === null ? null : modifier.id, {
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
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'modifiers'] });
      showSuccess(tCommon('saved'), { duration: 1500 });
      onClose();
    },
    onError: () => {
      showError(null, t('saveFailed'));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveModifier(id),
    onSuccess: (res) => {
      if (!res.ok) {
        showError(null, t('saveFailed'));
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'modifiers'] });
      setArchiveOpen(false);
      onClose();
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    saveMutation.mutate(values);
  });

  const modifierName = modifier ? fromLocalizedText(modifier.name, defaultLocale) : '';
  const groupNames = (usage?.groups ?? []).map((g) => fromLocalizedText(g.name, defaultLocale));
  const dishNames = dishUnion(usage, defaultLocale);

  return (
    <>
      <SheetHeader>
        <SheetTitle>{isNew ? t('editorTitleNew') : t('editorTitleEdit')}</SheetTitle>
      </SheetHeader>
      <form
        id="modifier-form"
        onSubmit={(e) => {
          void onSubmit(e);
        }}
        className="flex flex-1 flex-col gap-6 overflow-y-auto px-4"
      >
        <FieldGroup>
          <PhotoUpload
            itemId={modifier?.id ?? 'new'}
            currentS3Key={modifier?.imageS3Key ?? null}
            currentPhotoUrl={modifier?.imageUrl ?? null}
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
                id="modifier-name"
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
                <FieldLabel htmlFor="modifier-description">{t('descriptionLabel')}</FieldLabel>
                <Input
                  id="modifier-description"
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
                <FieldLabel htmlFor="modifier-price">{t('priceLabel')}</FieldLabel>
                <Input
                  id="modifier-price"
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
        <Button type="submit" form="modifier-form" disabled={saveMutation.isPending}>
          {isNew ? t('createBtn') : t('saveBtn')}
        </Button>
      </SheetFooter>

      {modifier !== null ? (
        <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('archiveDialogTitle')}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="flex flex-col gap-2 text-left">
                  <p>
                    {t('archiveDialogDescription', {
                      name: modifierName,
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
                  archiveMutation.mutate(modifier.id);
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
