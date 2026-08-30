import { useTranslation } from 'react-i18next';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export const percentChange = (value: number, previous: number): number | null =>
  previous === 0 ? null : ((value - previous) / previous) * 100;

export interface KpiCardProps {
  readonly title: string;
  readonly value: string;
  readonly previous: string;
  readonly change: number | null;
  readonly higherIsBetter: boolean;
}

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

export function KpiCard({ title, value, previous, change, higherIsBetter }: KpiCardProps) {
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

export function KpiCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-3 w-40" />
      </CardContent>
    </Card>
  );
}
