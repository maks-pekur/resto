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

const [
  REASON_OUT_OF_STOCK,
  REASON_KITCHEN_BUSY,
  REASON_GUEST_REQUESTED,
  REASON_GUEST_NO_SHOW,
  REASON_PAYMENT_ISSUE,
  REASON_DUPLICATE_ORDER,
  REASON_OTHER,
] = ORDER_CANCEL_REASON_CODES;

const OTHER_NOTE_MAX_LENGTH = 500;

export interface RejectPopoverProps {
  readonly brandSlug: string;
  readonly order: OrderFeedRowApi;
}

export function RejectPopover({ brandSlug, order }: RejectPopoverProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'orders' });
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [otherOpen, setOtherOpen] = React.useState(false);
  const [note, setNote] = React.useState('');

  const mutation = useMutation({
    mutationFn: (input: { reasonCode: OrderCancelReasonCode; cancelNote?: string }) =>
      cancelOrderMutation(brandSlug, {
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
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1"
            disabled={isPending}
            onClick={() => {
              mutation.mutate({ reasonCode: REASON_OUT_OF_STOCK });
            }}
          >
            {t('reasons.outOfStock')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1"
            disabled={isPending}
            onClick={() => {
              mutation.mutate({ reasonCode: REASON_KITCHEN_BUSY });
            }}
          >
            {t('reasons.kitchenBusy')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1"
            disabled={isPending}
            onClick={() => {
              mutation.mutate({ reasonCode: REASON_GUEST_REQUESTED });
            }}
          >
            {t('reasons.guestRequested')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1"
            disabled={isPending}
            onClick={() => {
              mutation.mutate({ reasonCode: REASON_GUEST_NO_SHOW });
            }}
          >
            {t('reasons.guestNoShow')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1"
            disabled={isPending}
            onClick={() => {
              mutation.mutate({ reasonCode: REASON_PAYMENT_ISSUE });
            }}
          >
            {t('reasons.paymentIssue')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1"
            disabled={isPending}
            onClick={() => {
              mutation.mutate({ reasonCode: REASON_DUPLICATE_ORDER });
            }}
          >
            {t('reasons.duplicate')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1"
            disabled={isPending}
            onClick={() => {
              setOtherOpen(true);
            }}
          >
            {t('reasons.other')}
          </Button>
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
