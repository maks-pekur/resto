import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { upsertModifierGroup } from '@/lib/queries/catalog';
import { ModifierGroupFormSchema, type ModifierGroupForm } from '@/lib/menu/zod-schemas';

export interface ModifierGroupFormState {
  readonly isNew: boolean;
  readonly isDirty: boolean;
  readonly isPending: boolean;
}

export interface ModifierGroupFormProps {
  readonly brandSlug: string;
  readonly initialValues: ModifierGroupForm;
  readonly groupId: string;
  readonly onSaved: (savedId: string) => void;
  readonly formId: string;
  readonly onStateChange: (state: ModifierGroupFormState) => void;
}

export function ModifierGroupFormComponent({
  brandSlug,
  initialValues,
  groupId,
  onSaved,
  formId,
  onStateChange,
}: ModifierGroupFormProps): React.ReactElement {
  const navigate = useNavigate();
  const { t } = useTranslation('translation', { keyPrefix: 'menu.modifierGroups' });
  const { t: tMod } = useTranslation('translation', { keyPrefix: 'menu.modifiers' });
  const { t: tCommon } = useTranslation('translation', { keyPrefix: 'common' });
  const queryClient = useQueryClient();
  const [pending, setPending] = React.useState(false);
  const form = useForm<ModifierGroupForm>({
    resolver: zodResolver(ModifierGroupFormSchema),
    defaultValues: initialValues,
    mode: 'onChange',
  });

  const isNew = groupId === 'new';
  const isDirty = form.formState.isDirty;

  React.useEffect(() => {
    onStateChange({ isNew, isDirty, isPending: pending });
  }, [isNew, isDirty, pending, onStateChange]);

  const mutation = useMutation({
    mutationFn: (values: ModifierGroupForm) =>
      upsertModifierGroup(brandSlug, isNew ? null : groupId, values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'modifier-groups', brandSlug] });
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
        /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call */
        void (navigate as any)({
          to: '/dashboard/$brandSlug/menu/modifier-groups/$id',
          params: { brandSlug, id: savedId },
          replace: true,
        });
        /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call */
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
        <div className="grid gap-4 md:grid-cols-[1fr_8rem_8rem]">
          <FormField
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.error ? true : undefined}>
                <FieldLabel htmlFor={field.name}>{tMod('nameLabel')}</FieldLabel>
                <Input
                  id={field.name}
                  maxLength={255}
                  aria-invalid={fieldState.error ? true : undefined}
                  {...field}
                />
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />
          <FormField
            control={form.control}
            name="minSelectable"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.error ? true : undefined}>
                <FieldLabel htmlFor={field.name}>{tMod('minLabel')}</FieldLabel>
                <Input
                  id={field.name}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={99}
                  name={field.name}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  value={field.value}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    field.onChange(Number.isFinite(n) ? n : 0);
                  }}
                />
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />
          <FormField
            control={form.control}
            name="maxSelectable"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.error ? true : undefined}>
                <FieldLabel htmlFor={field.name}>{tMod('maxLabel')}</FieldLabel>
                <Input
                  id={field.name}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={99}
                  name={field.name}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  value={field.value}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    field.onChange(Number.isFinite(n) ? n : 0);
                  }}
                />
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />
        </div>
      </FieldGroup>
    </form>
  );
}
