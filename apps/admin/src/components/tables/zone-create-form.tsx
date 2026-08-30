import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import {
  createTableZoneMutation,
  friendlyTableError,
  MAX_TABLES_PER_BULK_CALL,
  type ProblemDetails,
} from '@/lib/queries/table-zones';

export interface ZoneCreateFormProps {
  readonly locationId: string;
  readonly onCreated: (zoneId: string) => void;
}

export function ZoneCreateForm({ locationId, onCreated }: ZoneCreateFormProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'tables' });
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [tableCount, setTableCount] = useState('4');
  const [error, setError] = useState<string | null>(null);

  const parsedCount = Number(tableCount);
  const isCountValid =
    Number.isInteger(parsedCount) && parsedCount >= 0 && parsedCount <= MAX_TABLES_PER_BULK_CALL;
  const isNameValid = name.trim().length > 0;

  const mutation = useMutation({
    mutationFn: () =>
      createTableZoneMutation(locationId, { name: name.trim(), tableCount: parsedCount }),
    onSuccess: (res) => {
      if (!res.ok) {
        const message = friendlyTableError(res.status, res.data as ProblemDetails | null);
        showError(message);
        setError(message);
        return;
      }
      showSuccess(t('createZoneSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['tenancy', 'table-zones', locationId] });
      const created = res.data as { id?: string } | null;
      if (created?.id !== undefined) onCreated(created.id);
    },
    onError: () => {
      showError(null, t('errors.generic'));
      setError(t('errors.generic'));
    },
  });

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="grid max-w-sm gap-1.5">
          <Label htmlFor="zone-name">{t('zoneNameLabel')}</Label>
          <Input
            id="zone-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </div>
        <div className="grid max-w-sm gap-1.5">
          <Label htmlFor="zone-table-count">{t('tableCountLabel')}</Label>
          <Input
            id="zone-table-count"
            type="number"
            min={0}
            max={MAX_TABLES_PER_BULK_CALL}
            value={tableCount}
            onChange={(e) => {
              setTableCount(e.target.value);
            }}
          />
          {isCountValid ? null : (
            <p className="text-destructive text-sm">
              {t('tableCountHint', { max: MAX_TABLES_PER_BULK_CALL })}
            </p>
          )}
        </div>
        {error === null ? null : (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </CardContent>
      <CardFooter>
        <Button
          disabled={!isNameValid || !isCountValid || mutation.isPending}
          onClick={() => {
            mutation.mutate();
          }}
        >
          {t('createZoneSubmit')}
        </Button>
      </CardFooter>
    </Card>
  );
}
