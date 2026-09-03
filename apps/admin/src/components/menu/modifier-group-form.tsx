import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { FormField } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { upsertModifierGroup } from '@/lib/queries/catalog';
import { modifierGroupFormSchema, type ModifierGroupForm } from '@/lib/menu/zod-schemas';
import { LocalizedField } from '@/components/common/localized-field';
import { useContentLocales } from '@/hooks/use-content-locales';

export interface ModifierGroupFormState {
  readonly isNew: boolean;
  readonly isDirty: boolean;
  readonly isPending: boolean;
}

export interface ModifierGroupFormProps {
  readonly initialValues: ModifierGroupForm;
  readonly groupId: string;
  readonly onSaved: (savedId: string) => void;
  readonly formId: string;
  readonly onStateChange: (state: ModifierGroupFormState) => void;
}

export function ModifierGroupFormComponent({
  initialValues,
  groupId,
  onSaved,
  formId,
  onStateChange,
}: ModifierGroupFormProps): React.ReactElement {
  const navigate = useNavigate();
  const { t } = useTranslation('translation', { keyPrefix: 'menu.modifierGroups' });
  const { t: tGroups } = useTranslation('translation', { keyPrefix: 'menu.groups' });
  const { t: tMod } = useTranslation('translation', { keyPrefix: 'menu.modifiers' });
  const { t: tCommon } = useTranslation('translation', { keyPrefix: 'common' });
  const queryClient = useQueryClient();
  const [pending, setPending] = React.useState(false);
  const { defaultLocale, locales } = useContentLocales();
  const form = useForm<ModifierGroupForm>({
    resolver: zodResolver(modifierGroupFormSchema(defaultLocale)),
    defaultValues: initialValues,
    mode: 'onChange',
  });

  const isNew = groupId === 'new';
  const isDirty = form.formState.isDirty;

  React.useEffect(() => {
    onStateChange({ isNew, isDirty, isPending: pending });
  }, [isNew, isDirty, pending, onStateChange]);

  const mutation = useMutation({
    mutationFn: (values: ModifierGroupForm) => upsertModifierGroup(isNew ? null : groupId, values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'modifier-groups'] });
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setPending(true);
    try {
      const res = await mutation.mutateAsync(values);
      if (!res.ok) {
        showError(null, t('groupSaveFailed'));
        return;
      }
      showSuccess(isNew ? t('groupCreated') : tCommon('saved'), { duration: 1500 });
      const savedId = res.data?.id ?? '';
      onSaved(savedId);
      if (isNew) {
        void navigate({
          to: '/menu/ingredients/$id',
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
    <form
      id={formId}
      onSubmit={(e) => {
        void onSubmit(e);
      }}
      className="flex flex-col gap-6"
    >
      <FieldGroup>
        <FormField
          control={form.control}
          name="name"
          render={({ field, fieldState }) => (
            <LocalizedField
              id="group-name"
              label={tMod('nameLabel')}
              value={field.value}
              onChange={(next) => {
                field.onChange(next ?? {});
              }}
              onBlur={field.onBlur}
              locales={locales}
              defaultLocale={defaultLocale}
              maxLength={255}
              {...(fieldState.error ? { error: tMod('nameRequired') } : {})}
            />
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="display"
            render={({ field }) => (
              <Field>
                <FieldLabel>{tGroups('displayLabel')}</FieldLabel>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="flex flex-row gap-4"
                >
                  <FieldLabel htmlFor="group-display-tiles" className="w-fit font-normal">
                    <RadioGroupItem
                      value="tiles"
                      id="group-display-tiles"
                      data-testid="group-display-tiles"
                    />
                    {tGroups('displayTiles')}
                  </FieldLabel>
                  <FieldLabel htmlFor="group-display-tabs" className="w-fit font-normal">
                    <RadioGroupItem
                      value="tabs"
                      id="group-display-tabs"
                      data-testid="group-display-tabs"
                    />
                    {tGroups('displayTabs')}
                  </FieldLabel>
                </RadioGroup>
              </Field>
            )}
          />

          <FormField
            control={form.control}
            name="behaviour"
            render={({ field }) => (
              <Field>
                <FieldLabel>{tGroups('behaviourLabel')}</FieldLabel>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="flex flex-row gap-4"
                >
                  <FieldLabel htmlFor="group-behaviour-one" className="w-fit font-normal">
                    <RadioGroupItem
                      value="one"
                      id="group-behaviour-one"
                      data-testid="group-behaviour-one"
                    />
                    {tGroups('behaviourOne')}
                  </FieldLabel>
                  <FieldLabel htmlFor="group-behaviour-several" className="w-fit font-normal">
                    <RadioGroupItem
                      value="several"
                      id="group-behaviour-several"
                      data-testid="group-behaviour-several"
                    />
                    {tGroups('behaviourSeveral')}
                  </FieldLabel>
                </RadioGroup>
              </Field>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="isRequired"
          render={({ field }) => (
            <Field orientation="horizontal" className="justify-between">
              <FieldLabel htmlFor="group-required" className="font-normal">
                {tGroups('requiredLabel')}
              </FieldLabel>
              <Switch
                id="group-required"
                data-testid="group-required-switch"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  );
}
