import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
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
  /** Absent means this form is creating a zone rather than editing one. */
  readonly zone?: TableZoneView;
  readonly onCreated?: (zoneId: string) => void;
}

export function ZoneForm({ locationId, zone, onCreated }: ZoneFormProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'tables' });
  const queryClient = useQueryClient();
  const isEditing = zone !== undefined;

  const [name, setName] = useState(zone?.name ?? '');
  const [tableCount, setTableCount] = useState('4');
  const [formError, setFormError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const nameError = trimmedName.length === 0 ? t('zoneNameRequired') : null;
  const parsedCount = Number(tableCount);
  const countError =
    Number.isInteger(parsedCount) && parsedCount >= 0 && parsedCount <= MAX_TABLES_PER_BULK_CALL
      ? null
      : t('tableCountHint', { max: MAX_TABLES_PER_BULK_CALL });

  const mutation = useMutation({
    mutationFn: () =>
      isEditing
        ? renameTableZoneMutation(locationId, zone.id, trimmedName)
        : createTableZoneMutation(locationId, { name: trimmedName, tableCount: parsedCount }),
    onSuccess: (res) => {
      if (!res.ok) {
        const message = friendlyTableError(res.status, res.data as ProblemDetails | null);
        showError(message);
        setFormError(message);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['tenancy', 'table-zones', locationId] });
      showSuccess(isEditing ? t('renameZoneSuccess') : t('createZoneSuccess'));
      const created = res.data as { id?: string } | null;
      if (!isEditing && created?.id !== undefined) onCreated?.(created.id);
    },
    onError: () => {
      showError(null, t('errors.generic'));
      setFormError(t('errors.generic'));
    },
  });

  const blocked = nameError !== null || (!isEditing && countError !== null);

  return (
    <Card>
      <CardContent>
        <FieldGroup>
          <Field data-invalid={nameError !== null ? true : undefined}>
            <FieldLabel htmlFor="zone-name">{t('zoneNameLabel')}</FieldLabel>
            <Input
              id="zone-name"
              value={name}
              aria-invalid={nameError !== null}
              onChange={(e) => {
                setName(e.target.value);
                setFormError(null);
              }}
            />
            <FieldDescription>{t('zoneNameDescription')}</FieldDescription>
            {nameError === null ? null : <FieldError>{nameError}</FieldError>}
          </Field>

          {isEditing ? null : (
            <Field data-invalid={countError !== null ? true : undefined}>
              <FieldLabel htmlFor="zone-table-count">{t('tableCountLabel')}</FieldLabel>
              <Input
                id="zone-table-count"
                type="number"
                min={0}
                max={MAX_TABLES_PER_BULK_CALL}
                value={tableCount}
                aria-invalid={countError !== null}
                onChange={(e) => {
                  setTableCount(e.target.value);
                  setFormError(null);
                }}
              />
              <FieldDescription>{t('tableCountDescription')}</FieldDescription>
              {countError === null ? null : <FieldError>{countError}</FieldError>}
            </Field>
          )}

          {formError === null ? null : (
            <p role="alert" className="text-destructive text-sm">
              {formError}
            </p>
          )}
        </FieldGroup>
      </CardContent>
      <CardFooter>
        <Button
          disabled={blocked || mutation.isPending}
          onClick={() => {
            mutation.mutate();
          }}
        >
          {isEditing ? t('renameZoneSubmit') : t('createZoneSubmit')}
        </Button>
      </CardFooter>
    </Card>
  );
}
