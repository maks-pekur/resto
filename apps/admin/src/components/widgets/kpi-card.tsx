import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export const percentChange = (value: number, previous: number): number | null =>
  previous === 0 ? null : ((value - previous) / previous) * 100;

export interface KpiCardProps {
  readonly icon: ComponentType<{ className?: string }>;
  readonly title: string;
  readonly value: string;
  readonly previous: string;
  readonly change: number | null;
  readonly higherIsBetter: boolean;
  readonly withDivider?: boolean;
}

function Delta({ change, higherIsBetter }: { change: number | null; higherIsBetter: boolean }) {
  const { t } = useTranslation('translation', { keyPrefix: 'dashboard' });

  if (change === null) {
    return (
      <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] sm:text-xs">
        <span className="text-muted-foreground">{t('kpiNoBaseline')}</span>
      </div>
    );
  }

  const rising = change >= 0;
  const good = rising === higherIsBetter;
  const tone = good ? 'text-success' : 'text-destructive';
  const Arrow = rising ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] sm:text-xs">
      <Arrow className={cn('size-3 shrink-0 sm:size-3.5', tone)} />
      <span className={cn('whitespace-nowrap', tone)}>
        {`${rising ? '+' : '−'}${Math.abs(change).toFixed(1)}%`}
      </span>
      <span className="text-muted-foreground whitespace-nowrap">{t('kpiVsPrevious')}</span>
    </div>
  );
}

export function KpiCard({
  icon: Icon,
  title,
  value,
  previous,
  change,
  higherIsBetter,
  withDivider = false,
}: KpiCardProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'dashboard' });

  return (
    <div className="flex items-start">
      <div className="flex-1 space-y-1 sm:space-y-2 lg:space-y-3">
        <div className="text-muted-foreground flex items-center gap-1.5 sm:gap-2">
          <Icon className="size-3.5 sm:size-4" />
          <span className="truncate text-[10px] font-medium sm:text-xs lg:text-sm">{title}</span>
        </div>
        <p className="text-muted-foreground/70 hidden text-[10px] sm:block sm:text-xs">
          {t('kpiPrevious', { value: previous })}
        </p>
        <p className="text-xl leading-tight font-semibold tracking-tight sm:text-2xl lg:text-[28px]">
          {value}
        </p>
        <Delta change={change} higherIsBetter={higherIsBetter} />
      </div>
      {withDivider ? <div className="bg-border mx-4 hidden h-full w-px lg:block xl:mx-6" /> : null}
    </div>
  );
}

export function KpiCardSkeleton() {
  return (
    <div className="space-y-2 sm:space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}
