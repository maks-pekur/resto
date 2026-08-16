import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { OrderStatusPreset, OrderDatePreset } from '@/lib/queries/orders';

export interface OrderFilterBarProps {
  readonly statusFilter: OrderStatusPreset;
  readonly onStatusFilterChange: (value: OrderStatusPreset) => void;
  readonly datePreset: OrderDatePreset;
  readonly onDatePresetChange: (value: OrderDatePreset) => void;
  readonly isLive: boolean;
}

export function OrderFilterBar({
  statusFilter,
  onStatusFilterChange,
  datePreset,
  onDatePresetChange,
  isLive,
}: OrderFilterBarProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'orders.filters' });
  const { t: tFeed } = useTranslation('translation', { keyPrefix: 'orders.feed' });

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-background px-4 py-2 lg:px-6">
      <Select
        value={statusFilter}
        onValueChange={(value) => {
          onStatusFilterChange(value as OrderStatusPreset);
        }}
      >
        <SelectTrigger size="sm" aria-label={t('statusLabel')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">{t('statusActive')}</SelectItem>
          <SelectItem value="all_today">{t('statusAllToday')}</SelectItem>
          <SelectItem value="completed">{t('statusCompleted')}</SelectItem>
          <SelectItem value="canceled">{t('statusCanceled')}</SelectItem>
          <SelectItem value="refund_failed">{t('statusRefundFailed')}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={datePreset}
        onValueChange={(value) => {
          onDatePresetChange(value as OrderDatePreset);
        }}
      >
        <SelectTrigger size="sm" aria-label={t('dateLabel')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">{t('dateToday')}</SelectItem>
          <SelectItem value="yesterday">{t('dateYesterday')}</SelectItem>
          <SelectItem value="week">{t('dateWeek')}</SelectItem>
        </SelectContent>
      </Select>

      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1" aria-label={t('channelLabel')}>
            {t('channelSiteOnly')}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{t('channelHint')}</TooltipContent>
      </Tooltip>

      <Badge variant="outline" className="ml-auto gap-1.5">
        <span
          className={cn(
            'size-1.5 rounded-full',
            isLive ? 'bg-success' : 'animate-pulse bg-warning',
          )}
        />
        {isLive ? tFeed('live') : tFeed('reconnecting')}
      </Badge>
    </div>
  );
}
