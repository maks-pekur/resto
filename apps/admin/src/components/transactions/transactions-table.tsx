import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, RotateCcw } from 'lucide-react';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHeadCell,
  DataTableHeaderRow,
  DataTableRow,
} from '@/components/common/data-table';
import { RowActions } from '@/components/common/row-actions';
import { formatMoney } from '@/lib/utils';
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
    <DataTable>
      <DataTableHeaderRow>
        <DataTableHeadCell className="w-40">{t('columnDate')}</DataTableHeadCell>
        <DataTableHeadCell className="w-24">{t('columnOrder')}</DataTableHeadCell>
        <DataTableHeadCell className="w-32 text-right">{t('columnAmount')}</DataTableHeadCell>
        <DataTableHeadCell className="w-32 text-right">{t('columnRefunded')}</DataTableHeadCell>
        <DataTableHeadCell>{t('columnStatus')}</DataTableHeadCell>
        <DataTableHeadCell className="w-16 text-right">
          <span className="sr-only">{t('columnActions')}</span>
        </DataTableHeadCell>
      </DataTableHeaderRow>
      <DataTableBody>
        {rows.map((row) => {
          const state = stateOf(row);
          return (
            <DataTableRow
              key={row.paymentId}
              data-testid={`transaction-${row.paymentId}`}
              className={state === 'failed' ? 'bg-destructive/5' : undefined}
            >
              <DataTableCell className="text-muted-foreground tabular-nums">
                {new Date(row.createdAt).toLocaleString([], {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </DataTableCell>
              <DataTableCell className="font-medium tabular-nums">
                {t('orderNumber', { n: row.orderShortNumber })}
              </DataTableCell>
              <DataTableCell className="text-right tabular-nums">
                {formatMoney(row.amount, row.currency)}
              </DataTableCell>
              <DataTableCell className="text-muted-foreground text-right tabular-nums">
                {Number(row.refundedAmount) > 0
                  ? formatMoney(row.refundedAmount, row.currency)
                  : '—'}
              </DataTableCell>
              <DataTableCell
                className={state === 'failed' ? 'text-destructive' : 'text-muted-foreground'}
              >
                <span className="flex items-center gap-1.5">
                  {state === 'failed' ? <AlertCircle className="size-4" /> : null}
                  {t(`status.${state}`)}
                </span>
              </DataTableCell>
              <DataTableCell className="text-right">
                <RowActions
                  label={t('rowActionsAriaLabel', { n: row.orderShortNumber })}
                  actions={
                    state === 'failed' && can('order', 'cancel')
                      ? [
                          {
                            key: 'retry',
                            label: t('retryBtn'),
                            icon: RotateCcw,
                            disabled: retryMutation.isPending,
                            onSelect: () => {
                              retryMutation.mutate(row);
                            },
                          },
                        ]
                      : []
                  }
                />
              </DataTableCell>
            </DataTableRow>
          );
        })}
      </DataTableBody>
    </DataTable>
  );
}
