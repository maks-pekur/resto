import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Volume2, VolumeX } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { OrderStatusPreset, OrderDatePreset } from '@/lib/queries/orders';

export interface OrderFilterBarProps {
  readonly statusFilter: OrderStatusPreset;
  readonly onStatusFilterChange: (value: OrderStatusPreset) => void;
  readonly datePreset: OrderDatePreset;
  readonly onDatePresetChange: (value: OrderDatePreset) => void;
  readonly isLive: boolean;
  readonly soundMuted: boolean;
  readonly onSoundMutedChange: (muted: boolean) => void;
  readonly soundBlocked: boolean;
  readonly soundReady: boolean;
  readonly notificationsBlocked: boolean;
}

export function OrderFilterBar({
  statusFilter,
  onStatusFilterChange,
  datePreset,
  onDatePresetChange,
  isLive,
  soundMuted,
  onSoundMutedChange,
  soundBlocked,
  soundReady,
  notificationsBlocked,
}: OrderFilterBarProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'orders.filters' });
  const { t: tFeed } = useTranslation('translation', { keyPrefix: 'orders.feed' });
  const { t: tAlerts } = useTranslation('translation', { keyPrefix: 'orders.alerts' });

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

      <div className="ml-auto flex items-center gap-3">
        {soundBlocked ? (
          <span className="text-muted-foreground text-xs">{tAlerts('soundBlockedHint')}</span>
        ) : null}
        {notificationsBlocked ? (
          <span className="text-muted-foreground text-xs">{tAlerts('alertsBlockedHint')}</span>
        ) : null}
        {/* Until the browser has been unlocked the banner above is the sound control; two of
            them on one screen read as a duplicate. */}
        {soundReady ? (
          <div className="flex items-center gap-1.5">
            {soundMuted ? (
              <VolumeX className="text-muted-foreground size-4" />
            ) : (
              <Volume2 className="text-muted-foreground size-4" />
            )}
            <span className="text-muted-foreground text-xs">{tAlerts('muteToggleLabel')}</span>
            <Switch
              checked={!soundMuted}
              onCheckedChange={(checked) => {
                onSoundMutedChange(!checked);
              }}
              aria-label={soundMuted ? tAlerts('muteOffAria') : tAlerts('muteOnAria')}
            />
          </div>
        ) : null}
        <Badge variant="outline" className="gap-1.5">
          <span
            className={cn(
              'size-1.5 rounded-full',
              isLive ? 'bg-success' : 'animate-pulse bg-warning',
            )}
          />
          {isLive ? tFeed('live') : tFeed('reconnecting')}
        </Badge>
      </div>
    </div>
  );
}
