import { useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Route as protectedLayoutRoute } from './_layout';
import { requirePermission } from '@/lib/auth/permissions';
import { buildPresetRange, type DateRange } from '@/lib/date-range';
import { transactionsQuery, type TransactionStatusFilter } from '@/lib/queries/transactions';
import { PageHeading } from '@/components/common/page-heading';
import { DateRangeStepper } from '@/components/common/date-range-stepper';
import { FilterTabs } from '@/components/common/filter-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { TransactionsTable } from '@/components/transactions/transactions-table';

const STATUS_TABS: readonly TransactionStatusFilter[] = [
  'all',
  'paid',
  'refunded',
  'refund_failed',
];

export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/tenant/transactions',
  beforeLoad: requirePermission('billing', 'read'),
  component: TransactionsPage,
});

function TransactionsPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'transactions' });
  const [status, setStatus] = useState<TransactionStatusFilter>('all');
  const [range, setRange] = useState<DateRange>(() => buildPresetRange('last7'));

  const listQuery = useQuery(transactionsQuery(status, range));
  const rows = listQuery.data?.data?.rows ?? [];

  return (
    <>
      <PageHeading title={t('title')} />
      <div className="flex flex-col gap-4 px-4 lg:px-6">
        <div className="bg-card flex h-14 items-stretch overflow-hidden rounded-lg border">
          <FilterTabs
            value={status}
            onChange={setStatus}
            items={STATUS_TABS.map((tab) => ({
              value: tab,
              label: t(`tabs.${tab}`),
              ...(tab === 'refund_failed' ? { tone: 'destructive' as const } : {}),
            }))}
          />
          <div className="ml-auto flex items-center px-3">
            <DateRangeStepper value={range} onChange={setRange} />
          </div>
        </div>

        {listQuery.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">{t('empty')}</p>
        ) : (
          <TransactionsTable rows={rows} />
        )}
      </div>
    </>
  );
}
