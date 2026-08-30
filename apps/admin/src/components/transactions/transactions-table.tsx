import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatMoney } from '@/lib/utils';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { usePermissions } from '@/hooks/use-permissions';
import { retryRefundMutation } from '@/lib/queries/orders';
import type { TransactionRowApi } from '@/lib/queries/transactions';

const stateOf = (row: TransactionRowApi): 'failed' | 'refunded' | 'paid' => {
  if (row.hasFailedRefund) return 'failed';
  return Number(row.refundedAmount) > 0 ? 'refunded' : 'paid';
};

export interface TransactionsTableProps {
  readonly rows: readonly TransactionRowApi[];
}

export function TransactionsTable({ rows }: TransactionsTableProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'transactions' });
  const queryClient = useQueryClient();
  const { can } = usePermissions();

  const retryMutation = useMutation({
    mutationFn: (row: TransactionRowApi) =>
      retryRefundMutation({ orderId: row.orderId, locationId: row.locationId }),
    onSuccess: (res) => {
      if (!res.ok) {
        showError(null, t('retryFailed'));
        return;
      }
      showSuccess(t('retrySucceeded'));
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: () => {
      showError(null, t('retryFailed'));
    },
  });

  return (
    <div className="overflow-x-auto rounded-md border">
      <div className="text-muted-foreground hidden border-b py-1.5 text-xs sm:flex">
        <span className="w-36 shrink-0 px-3">{t('columnDate')}</span>
        <span className="w-24 shrink-0 px-3">{t('columnOrder')}</span>
        <span className="w-28 shrink-0 px-3 text-right">{t('columnAmount')}</span>
        <span className="w-28 shrink-0 px-3 text-right">{t('columnRefunded')}</span>
        <span className="flex-1 px-3">{t('columnStatus')}</span>
      </div>
      {rows.map((row) => {
        const state = stateOf(row);
        return (
          <div
            key={row.paymentId}
            data-testid={`transaction-${row.paymentId}`}
            className={cn(
              'flex flex-wrap items-center border-b py-2 text-sm',
              state === 'failed' ? 'bg-destructive/5' : 'hover:bg-muted/40',
            )}
          >
            <span className="text-muted-foreground w-36 shrink-0 px-3 tabular-nums">
              {new Date(row.createdAt).toLocaleString([], {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span className="w-24 shrink-0 px-3 font-medium tabular-nums">
              {t('orderNumber', { n: row.orderShortNumber })}
            </span>
            <span className="w-28 shrink-0 px-3 text-right tabular-nums">
              {formatMoney(row.amount, row.currency)}
            </span>
            <span className="text-muted-foreground w-28 shrink-0 px-3 text-right tabular-nums">
              {Number(row.refundedAmount) > 0 ? formatMoney(row.refundedAmount, row.currency) : '—'}
            </span>
            <span
              className={cn(
                'flex flex-1 items-center gap-1.5 px-3',
                state === 'failed' ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {state === 'failed' ? <AlertCircle className="size-4" /> : null}
              {t(`status.${state}`)}
            </span>
            {state === 'failed' && can('order', 'cancel') ? (
              <span className="px-3">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={retryMutation.isPending}
                  onClick={() => {
                    retryMutation.mutate(row);
                  }}
                >
                  {t('retryBtn')}
                </Button>
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
