import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import {
  createTableZoneMutation,
  friendlyTableError,
  MAX_TABLES_PER_BULK_CALL,
  type ProblemDetails,
} from '@/lib/queries/table-zones';

export interface CreateTableZoneDialogProps {
  readonly locationId: string;
}

export function CreateTableZoneDialog({
  locationId,
}: CreateTableZoneDialogProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'tables' });
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [tableCount, setTableCount] = React.useState('4');

  const parsedCount = Number(tableCount);
  const isCountValid =
    Number.isInteger(parsedCount) && parsedCount >= 0 && parsedCount <= MAX_TABLES_PER_BULK_CALL;
  const isNameValid = name.trim().length > 0;

  const mutation = useMutation({
    mutationFn: () =>
      createTableZoneMutation(locationId, { name: name.trim(), tableCount: parsedCount }),
    onSuccess: (res) => {
      if (!res.ok) {
        showError(friendlyTableError(res.status, res.data as ProblemDetails | null));
        return;
      }
      showSuccess(t('createZoneSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['tenancy', 'table-zones', locationId] });
      setOpen(false);
      setName('');
      setTableCount('4');
    },
    onError: () => {
      showError(null, t('errors.generic'));
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) mutation.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>{t('createZoneBtn')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('createZoneDialogTitle')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="create-zone-name">{t('zoneNameLabel')}</Label>
            <Input
              id="create-zone-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="create-zone-table-count">{t('tableCountLabel')}</Label>
            <Input
              id="create-zone-table-count"
              type="number"
              min={0}
              max={MAX_TABLES_PER_BULK_CALL}
              value={tableCount}
              onChange={(e) => {
                setTableCount(e.target.value);
              }}
            />
            {!isCountValid ? (
              <p className="text-destructive text-sm">
                {t('tableCountHint', { max: MAX_TABLES_PER_BULK_CALL })}
              </p>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
            }}
          >
            {t('cancelAction')}
          </Button>
          <Button
            disabled={!isNameValid || !isCountValid || mutation.isPending}
            onClick={() => {
              mutation.mutate();
            }}
          >
            {t('createZoneSubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
