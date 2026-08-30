import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Volume2, VolumeX } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { DateRangeStepper } from '@/components/common/date-range-stepper';
import {
  OrderFulfillmentTabs,
  OrderStatusTabs,
  type OrderFulfillmentTab,
} from '@/components/orders/order-tabs';
import type { DateRange } from '@/lib/date-range';
import type { OrderFeedCountsApi, OrderStatusPreset } from '@/lib/queries/orders';

export interface OrderFilterBarProps {
  readonly fulfillment: OrderFulfillmentTab;
  readonly onFulfillmentChange: (value: OrderFulfillmentTab) => void;
  readonly status: OrderStatusPreset;
  readonly onStatusChange: (value: OrderStatusPreset) => void;
  readonly counts: OrderFeedCountsApi | null;
  readonly refundFailedCount: number;
  readonly range: DateRange;
  readonly onRangeChange: (range: DateRange) => void;
  readonly soundMuted: boolean;
  readonly onSoundMutedChange: (muted: boolean) => void;
  readonly soundBlocked: boolean;
  readonly soundReady: boolean;
  readonly notificationsBlocked: boolean;
}

/** Type, dates and status are one decision about what to look at, so they are one surface. */
export function OrderFilterBar({
  fulfillment,
  onFulfillmentChange,
  status,
  onStatusChange,
  counts,
  refundFailedCount,
  range,
  onRangeChange,
  soundMuted,
  onSoundMutedChange,
  soundBlocked,
  soundReady,
  notificationsBlocked,
}: OrderFilterBarProps): React.ReactElement {
  const { t: tAlerts } = useTranslation('translation', { keyPrefix: 'orders.alerts' });

  return (
    <div className="bg-card mx-4 flex flex-col overflow-hidden rounded-lg border lg:mx-6">
      <div className="flex min-h-11 flex-wrap items-stretch">
        <OrderFulfillmentTabs value={fulfillment} onChange={onFulfillmentChange} />

        <div className="ml-auto flex items-center gap-2 px-3">
          <DateRangeStepper value={range} onChange={onRangeChange} />

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
        </div>
      </div>

      <div className="h-11 border-t">
        <OrderStatusTabs
          value={status}
          onChange={onStatusChange}
          counts={counts}
          refundFailedCount={refundFailedCount}
        />
      </div>
    </div>
  );
}
