import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Volume2, VolumeX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { DateRangeStepper } from '@/components/common/date-range-stepper';
import { OrderFulfillmentTabs, type OrderFulfillmentTab } from '@/components/orders/order-tabs';
import { cn } from '@/lib/utils';
import type { DateRange } from '@/lib/date-range';

export interface OrderFilterBarProps {
  readonly fulfillment: OrderFulfillmentTab;
  readonly onFulfillmentChange: (value: OrderFulfillmentTab) => void;
  readonly range: DateRange;
  readonly onRangeChange: (range: DateRange) => void;
  readonly isLive: boolean;
  readonly soundMuted: boolean;
  readonly onSoundMutedChange: (muted: boolean) => void;
  readonly soundBlocked: boolean;
  readonly soundReady: boolean;
  readonly notificationsBlocked: boolean;
}

export function OrderFilterBar({
  fulfillment,
  onFulfillmentChange,
  range,
  onRangeChange,
  isLive,
  soundMuted,
  onSoundMutedChange,
  soundBlocked,
  soundReady,
  notificationsBlocked,
}: OrderFilterBarProps): React.ReactElement {
  const { t: tFeed } = useTranslation('translation', { keyPrefix: 'orders.feed' });
  const { t: tAlerts } = useTranslation('translation', { keyPrefix: 'orders.alerts' });

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 lg:px-6">
      <OrderFulfillmentTabs value={fulfillment} onChange={onFulfillmentChange} />

      <DateRangeStepper value={range} onChange={onRangeChange} className="ml-auto" />

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
  );
}
