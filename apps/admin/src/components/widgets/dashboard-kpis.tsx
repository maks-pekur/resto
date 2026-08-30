import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { CircleDollarSign, ClipboardList, CreditCard, Users } from 'lucide-react';
import { dashboardKpisQuery } from '@/lib/queries/analytics';
import { KpiCard, KpiCardSkeleton, percentChange } from '@/components/widgets/kpi-card';
import type { DateRange } from '@/lib/date-range';
import { formatMoney } from '@/lib/utils';

export interface DashboardKpisProps {
  readonly locationId: string;
  readonly range: DateRange;
}

export function DashboardKpis({ locationId, range }: DashboardKpisProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'dashboard' });
  const { data, isPending } = useQuery(dashboardKpisQuery(locationId, range));

  const kpis = data?.data ?? null;

  return (
    <div className="bg-card grid grid-cols-2 gap-3 rounded-xl border p-4 sm:gap-4 sm:p-5 lg:grid-cols-4 lg:gap-6 lg:p-6">
      {kpis === null ? (
        isPending ? (
          <>
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
          </>
        ) : null
      ) : (
        <>
          <KpiCard
            icon={CircleDollarSign}
            title={t('kpiRevenue')}
            value={formatMoney(kpis.revenue.value, kpis.currency)}
            previous={formatMoney(kpis.revenue.previous, kpis.currency)}
            change={percentChange(Number(kpis.revenue.value), Number(kpis.revenue.previous))}
            higherIsBetter
            withDivider
          />
          <KpiCard
            icon={ClipboardList}
            title={t('kpiOrders')}
            value={String(kpis.completedOrders.value)}
            previous={String(kpis.completedOrders.previous)}
            change={percentChange(kpis.completedOrders.value, kpis.completedOrders.previous)}
            higherIsBetter
            withDivider
          />
          <KpiCard
            icon={Users}
            title={t('kpiNewGuests')}
            value={String(kpis.newGuests.value)}
            previous={String(kpis.newGuests.previous)}
            change={percentChange(kpis.newGuests.value, kpis.newGuests.previous)}
            higherIsBetter
            withDivider
          />
          <KpiCard
            icon={CreditCard}
            title={t('kpiRefunds')}
            value={formatMoney(kpis.refunds.value, kpis.currency)}
            previous={formatMoney(kpis.refunds.previous, kpis.currency)}
            change={percentChange(Number(kpis.refunds.value), Number(kpis.refunds.previous))}
            higherIsBetter={false}
          />
        </>
      )}
    </div>
  );
}
