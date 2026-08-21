import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { formatMoney } from '@/lib/utils';
import { cancelOrderMutation } from '@/lib/queries/orders';
import type { OrderFeedRowApi } from '@/lib/queries/orders';

export const ORDER_CANCEL_REASON_CODES = [
  'kitchen_out_of_stock',
  'kitchen_too_busy',
  'guest_requested',
  'guest_no_show',
  'payment_issue',
  'duplicate_order',
  'other',
] as const;

export type OrderCancelReasonCode = (typeof ORDER_CANCEL_REASON_CODES)[number];

const REASON_OTHER = 'other' satisfies OrderCancelReasonCode;

export const REASON_LABEL_KEYS: Record<OrderCancelReasonCode, string> = {
  kitchen_out_of_stock: 'reasons.outOfStock',
  kitchen_too_busy: 'reasons.kitchenBusy',
  guest_requested: 'reasons.guestRequested',
  guest_no_show: 'reasons.guestNoShow',
  payment_issue: 'reasons.paymentIssue',
  duplicate_order: 'reasons.duplicate',
  other: 'reasons.other',
};

const OTHER_NOTE_MAX_LENGTH = 500;

export interface RejectPopoverProps {
  readonly order: OrderFeedRowApi;
}

export function RejectPopover({ order }: RejectPopoverProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'orders' });
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [otherOpen, setOtherOpen] = React.useState(false);
  const [note, setNote] = React.useState('');

  const mutation = useMutation({
    mutationFn: (input: { reasonCode: OrderCancelReasonCode; cancelNote?: string }) =>
      cancelOrderMutation({
        orderId: order.id,
        locationId: order.locationId,
        reasonCode: input.reasonCode,
        ...(input.cancelNote !== undefined ? { cancelNote: input.cancelNote } : {}),
      }),
    onSuccess: (res) => {
      if (!res.ok || !res.data) {
        showError(null, t('reject.failedToast'));
        return;
      }
      setOpen(false);
      setOtherOpen(false);
      setNote('');
      showSuccess(
        t('reject.rejectedToast', {
          n: order.shortNumber,
          amount: formatMoney(order.total, order.currency),
        }),
      );
      void queryClient.invalidateQueries({ queryKey: ['orders', 'feed'] });
    },
    onError: () => {
      showError(null, t('reject.failedToast'));
    },
  });

  const handleOpenChange = (next: boolean): void => {
    setOpen(next);
    if (!next) {
      setOtherOpen(false);
      setNote('');
    }
  };

  const confirmOther = (): void => {
    const trimmed = note.trim();
    if (trimmed.length === 0) return;
    mutation.mutate({ reasonCode: REASON_OTHER, cancelNote: trimmed });
  };

  const isPending = mutation.isPending;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button size="lg" variant="outline" className="h-12 flex-1">
          {t('card.rejectBtn')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <p className="mb-3 text-sm font-semibold">{t('reject.title')}</p>
        <div className="flex flex-wrap gap-2">
          {ORDER_CANCEL_REASON_CODES.map((code) => (
            <Button
              key={code}
              type="button"
              variant="outline"
              className="h-12 flex-1"
              disabled={isPending}
              onClick={() => {
                if (code === REASON_OTHER) {
                  setOtherOpen(true);
                  return;
                }
                mutation.mutate({ reasonCode: code });
              }}
            >
              {t(REASON_LABEL_KEYS[code])}
            </Button>
          ))}
        </div>
        {otherOpen ? (
          <div className="mt-3 flex flex-col gap-2">
            <Textarea
              value={note}
              maxLength={OTHER_NOTE_MAX_LENGTH}
              placeholder={t('reject.otherPlaceholder')}
              onChange={(event) => {
                setNote(event.target.value);
              }}
            />
            <Button type="button" className="h-12" disabled={isPending} onClick={confirmOther}>
              {t('reject.otherConfirm')}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
