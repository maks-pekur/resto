'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ModifierGroupFormSchema, type ModifierGroupForm } from '@/lib/menu/zod-schemas';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { upsertModifierGroupAction } from '../upsert-modifier-group-action';

export interface ModifierGroupFormClientProps {
  readonly initialValues: ModifierGroupForm;
  readonly groupId: string;
  readonly onSaved: (savedId: string) => void;
}

export function ModifierGroupFormClient({
  initialValues,
  groupId,
  onSaved,
}: ModifierGroupFormClientProps): React.ReactElement {
  const router = useRouter();
  const t = useTranslations('menu.modifierGroups');
  const tMod = useTranslations('menu.modifiers');
  const tCommon = useTranslations('common');
  const [pending, setPending] = React.useState(false);
  const form = useForm<ModifierGroupForm>({
    resolver: zodResolver(ModifierGroupFormSchema),
    defaultValues: initialValues,
    mode: 'onChange',
  });

  const isNew = groupId === 'new';
  const isDirty = form.formState.isDirty;
  const canSubmit = isNew ? true : isDirty;

  const onSubmit = form.handleSubmit(async (values) => {
    setPending(true);
    const res = await upsertModifierGroupAction({
      ...(isNew ? {} : { groupId }),
      values,
    });
    setPending(false);
    if (!res.ok) {
      showError(res.error, t('groupSaveFailed'));
      return;
    }
    showSuccess(isNew ? t('groupCreated') : tCommon('saved'), { duration: 1500 });
    onSaved(res.id);
    if (isNew) {
      router.replace(`/dashboard/menu/modifier-groups/${res.id}`);
    } else {
      form.reset(values);
    }
  });

  return (
    <form
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
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !canSubmit}>
          {pending ? tCommon('saving') : isNew ? t('createGroupBtn') : tCommon('save')}
        </Button>
      </div>
    </form>
  );
}
