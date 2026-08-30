import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useEffectiveLocation } from '@/hooks/use-effective-location';
import { dashboardKpisQuery, DEFAULT_KPI_RANGE_DAYS } from '@/lib/queries/analytics';
import { KpiCard, KpiCardSkeleton, percentChange } from '@/components/widgets/kpi-card';
import { formatMoney } from '@/lib/utils';

export function DashboardKpis() {
  const { t } = useTranslation('translation', { keyPrefix: 'dashboard' });
  const { mode, locationId } = useEffectiveLocation();

  const { data, isPending } = useQuery({
    ...dashboardKpisQuery(mode === 'all' ? 'all' : (locationId ?? '')),
    enabled: mode === 'all' || locationId !== undefined,
  });

  const kpis = data?.data ?? null;
  const days = kpis?.range.days ?? DEFAULT_KPI_RANGE_DAYS;

  return (
    <section className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">{t('kpiRange', { days })}</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
              title={t('kpiRevenue')}
              value={formatMoney(kpis.revenue.value, kpis.currency)}
              previous={formatMoney(kpis.revenue.previous, kpis.currency)}
              change={percentChange(Number(kpis.revenue.value), Number(kpis.revenue.previous))}
              higherIsBetter
            />
            <KpiCard
              title={t('kpiOrders')}
              value={String(kpis.completedOrders.value)}
              previous={String(kpis.completedOrders.previous)}
              change={percentChange(kpis.completedOrders.value, kpis.completedOrders.previous)}
              higherIsBetter
            />
            <KpiCard
              title={t('kpiNewGuests')}
              value={String(kpis.newGuests.value)}
              previous={String(kpis.newGuests.previous)}
              change={percentChange(kpis.newGuests.value, kpis.newGuests.previous)}
              higherIsBetter
            />
            <KpiCard
              title={t('kpiRefunds')}
              value={formatMoney(kpis.refunds.value, kpis.currency)}
              previous={formatMoney(kpis.refunds.previous, kpis.currency)}
              change={percentChange(Number(kpis.refunds.value), Number(kpis.refunds.previous))}
              higherIsBetter={false}
            />
          </>
        )}
      </div>
    </section>
  );
}
