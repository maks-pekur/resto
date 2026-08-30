import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { useEffectiveLocation } from '@/lib/hooks/use-effective-location';
import { dashboardKpisQuery, DEFAULT_KPI_RANGE_DAYS } from '@/lib/queries/analytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatMoney } from '@/lib/utils';

const percentChange = (value: number, previous: number): number | null =>
  previous === 0 ? null : ((value - previous) / previous) * 100;

function DeltaBadge({
  change,
  higherIsBetter,
}: {
  change: number | null;
  higherIsBetter: boolean;
}) {
  const { t } = useTranslation('translation', { keyPrefix: 'dashboard' });

  if (change === null) {
    return <span className="text-muted-foreground text-xs">{t('kpiNoBaseline')}</span>;
  }

  const rising = change >= 0;
  const good = rising === higherIsBetter;
  const Icon = rising ? TrendingUp : TrendingDown;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium',
        good ? 'text-success' : 'text-destructive',
      )}
    >
      <Icon className="size-3.5" />
      {`${rising ? '+' : '−'}${Math.abs(change).toFixed(1)}%`}
    </span>
  );
}

function KpiCard({
  title,
  value,
  previous,
  change,
  higherIsBetter,
}: {
  title: string;
  value: string;
  previous: string;
  change: number | null;
  higherIsBetter: boolean;
}) {
  const { t } = useTranslation('translation', { keyPrefix: 'dashboard' });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <DeltaBadge change={change} higherIsBetter={higherIsBetter} />
          <span className="text-muted-foreground text-xs">
            {t('kpiPrevious', { value: previous })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiSkeletons() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-40" />
          </CardContent>
        </Card>
      ))}
    </>
  );
}

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
            <KpiSkeletons />
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
