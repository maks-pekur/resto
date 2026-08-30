import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { ZoneFormSchema, ZONE_NAME_MAX, type ZoneFormValues } from '@/lib/tables/zone-schema';
import {
  createTableZoneMutation,
  friendlyTableError,
  MAX_TABLES_PER_BULK_CALL,
  renameTableZoneMutation,
  type ProblemDetails,
  type TableZoneView,
} from '@/lib/queries/table-zones';

export interface ZoneFormProps {
  readonly locationId: string;
  readonly locationSlug: string;
  /** Absent means this form creates a zone rather than editing one. */
  readonly zone?: TableZoneView;
  readonly onCreated?: (zoneId: string) => void;
}

export function ZoneForm({ locationId, locationSlug, zone, onCreated }: ZoneFormProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'tables' });
  const { t: tCommon } = useTranslation('translation', { keyPrefix: 'common' });
  const queryClient = useQueryClient();
  const isEditing = zone !== undefined;
  const formId = useId();
  const summaryRef = useRef<HTMLDivElement>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<ZoneFormValues>({
    resolver: zodResolver(ZoneFormSchema),
    // Blur is where a person has finished a thought; nagging on every keystroke is noise.
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: { name: zone?.name ?? '', tableCount: 4 },
  });
  const { errors, isSubmitting } = form.formState;

  const mutation = useMutation({
    mutationFn: (values: ZoneFormValues) =>
      isEditing
        ? renameTableZoneMutation(locationId, zone.id, values.name)
        : createTableZoneMutation(locationId, {
            name: values.name,
            tableCount: values.tableCount,
          }),
    onSuccess: (res) => {
      if (!res.ok) {
        const message = friendlyTableError(res.status, res.data as ProblemDetails | null);
        showError(message);
        setSubmitError(message);
        summaryRef.current?.focus();
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['tenancy', 'table-zones', locationId] });
      showSuccess(isEditing ? t('renameZoneSuccess') : t('createZoneSuccess'));
      const created = res.data as { id?: string } | null;
      if (isEditing) {
        form.reset({ name: form.getValues('name'), tableCount: 4 });
      } else if (created?.id !== undefined) {
        onCreated?.(created.id);
      }
    },
    onError: () => {
      showError(null, t('errors.generic'));
      setSubmitError(t('errors.generic'));
      summaryRef.current?.focus();
    },
  });

  const onSubmit = form.handleSubmit(
    async (values) => {
      setSubmitError(null);
      await mutation.mutateAsync(values);
    },
    () => {
      // A failed submit must be findable by keyboard, not only visible beside the field.
      summaryRef.current?.focus();
    },
  );

  const fieldErrors = [
    errors.name
      ? { field: 'name', message: t(`form.${errors.name.message ?? 'nameRequired'}`) }
      : null,
    !isEditing && errors.tableCount
      ? { field: 'tableCount', message: t(`form.${errors.tableCount.message ?? 'countInvalid'}`) }
      : null,
  ].filter((entry): entry is { field: string; message: string } => entry !== null);

  const busy = isSubmitting || mutation.isPending;

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{isEditing ? t('form.editTitle') : t('form.createTitle')}</CardTitle>
        <CardDescription>
          {isEditing ? t('form.editDescription') : t('form.createDescription')}
        </CardDescription>
      </CardHeader>

      <form
        id={formId}
        noValidate
        onSubmit={(event) => {
          void onSubmit(event);
        }}
      >
        <CardContent>
          {fieldErrors.length > 0 || submitError !== null ? (
            <div
              ref={summaryRef}
              role="alert"
              tabIndex={-1}
              className="border-destructive/40 bg-destructive/5 text-destructive mb-6 rounded-md border p-3 text-sm outline-none"
            >
              <p className="font-medium">{t('form.summaryTitle')}</p>
              <ul className="mt-1 list-inside list-disc">
                {submitError === null ? null : <li>{submitError}</li>}
                {fieldErrors.map((entry) => (
                  <li key={entry.field}>
                    <a className="underline" href={`#${formId}-${entry.field}`}>
                      {entry.message}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <FieldGroup>
            <Field data-invalid={errors.name ? true : undefined}>
              <FieldLabel htmlFor={`${formId}-name`}>
                {t('zoneNameLabel')}
                <span aria-hidden className="text-destructive ml-0.5">
                  *
                </span>
              </FieldLabel>
              <Input
                id={`${formId}-name`}
                autoFocus={!isEditing}
                maxLength={ZONE_NAME_MAX}
                aria-required
                aria-invalid={errors.name ? true : undefined}
                {...form.register('name')}
              />
              <FieldDescription>{t('zoneNameDescription')}</FieldDescription>
              {errors.name ? (
                <FieldError>{t(`form.${errors.name.message ?? 'nameRequired'}`)}</FieldError>
              ) : null}
            </Field>

            {isEditing ? null : (
              <Field data-invalid={errors.tableCount ? true : undefined}>
                <FieldLabel htmlFor={`${formId}-tableCount`}>{t('tableCountLabel')}</FieldLabel>
                <Input
                  id={`${formId}-tableCount`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_TABLES_PER_BULK_CALL}
                  className="max-w-40"
                  aria-invalid={errors.tableCount ? true : undefined}
                  {...form.register('tableCount')}
                />
                <FieldDescription>{t('tableCountDescription')}</FieldDescription>
                {errors.tableCount ? (
                  <FieldError>
                    {t(`form.${errors.tableCount.message ?? 'countInvalid'}`)}
                  </FieldError>
                ) : null}
              </Field>
            )}
          </FieldGroup>
        </CardContent>

        <CardFooter className="justify-end gap-2 border-t pt-6">
          <Button variant="outline" asChild disabled={busy}>
            <Link to="/locations/$slug/tables" params={{ slug: locationSlug }}>
              {tCommon('cancel')}
            </Link>
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy ? t('form.saving') : isEditing ? t('form.save') : t('form.create')}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
