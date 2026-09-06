import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { useMoney } from '@/hooks/use-money';
import { cancelOrderMutation } from '@/lib/queries/orders';
import {
  ORDER_CANCEL_REASON_CODES,
  REASON_LABEL_KEYS,
  type OrderCancelReasonCode,
} from './reject-popover';

export interface CancelDialogOrder {
  readonly id: string;
  readonly shortNumber: number;
  readonly locationId: string;
  readonly total: string;
  readonly currency: string;
}

export interface CancelDialogProps {
  readonly order: CancelDialogOrder;
  readonly onCanceled?: () => void;
}

export function CancelDialog({ order, onCanceled }: CancelDialogProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'orders' });
  const money = useMoney();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [reasonCode, setReasonCode] = React.useState<OrderCancelReasonCode | ''>('');
  const amount = money(order.total, order.currency);

  const mutation = useMutation({
    mutationFn: (selectedReasonCode: OrderCancelReasonCode) =>
      cancelOrderMutation({
        orderId: order.id,
        locationId: order.locationId,
        reasonCode: selectedReasonCode,
      }),
    onSuccess: (res) => {
      if (!res.ok || !res.data) {
        showError(null, t('cancel.failedToast'));
        return;
      }
      showSuccess(t('cancel.canceledToast', { n: order.shortNumber, amount }));
      void queryClient.invalidateQueries({ queryKey: ['orders', 'feed'] });
      void queryClient.invalidateQueries({ queryKey: ['orders', 'detail'] });
      onCanceled?.();
    },
    onError: () => {
      showError(null, t('cancel.failedToast'));
    },
  });

  const handleOpenChange = (next: boolean): void => {
    setOpen(next);
    if (!next) setReasonCode('');
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="h-12 w-full border-destructive text-destructive">
          {t('cancel.triggerBtn')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('cancel.dialogTitle', { n: order.shortNumber })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('cancel.dialogDescription', { amount })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="cancel-dialog-reason">
            {t('cancel.reasonLabel')}
          </label>
          <Select
            value={reasonCode}
            onValueChange={(value) => {
              setReasonCode(value as OrderCancelReasonCode);
            }}
          >
            <SelectTrigger id="cancel-dialog-reason" className="w-full">
              <SelectValue placeholder={t('cancel.reasonLabel')} />
            </SelectTrigger>
            <SelectContent>
              {ORDER_CANCEL_REASON_CODES.map((code) => (
                <SelectItem key={code} value={code}>
                  {t(REASON_LABEL_KEYS[code])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel.dismissBtn')}</AlertDialogCancel>
          <AlertDialogAction
            className="h-12"
            disabled={reasonCode === '' || mutation.isPending}
            onClick={() => {
              if (reasonCode === '') return;
              mutation.mutate(reasonCode);
            }}
          >
            {t('cancel.confirmBtn', { amount })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
