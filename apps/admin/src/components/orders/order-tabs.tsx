import { useTranslation } from 'react-i18next';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { OrderFeedCountsApi, OrderStatusPreset } from '@/lib/queries/orders';

// The tab groups sit inside one filter bar, so they carry no surface of their own — the active
// tab is marked against the bar's background rather than against a pill inside it.
const TAB_LIST_CLASS = 'h-8 gap-1 bg-transparent p-0';
const TAB_TRIGGER_CLASS =
  'data-[state=active]:bg-muted data-[state=active]:shadow-none dark:data-[state=active]:bg-muted';

export type OrderFulfillmentTab = 'all' | 'delivery' | 'pickup';

export const ORDER_FULFILLMENT_TABS: readonly OrderFulfillmentTab[] = ['all', 'delivery', 'pickup'];

export interface OrderFulfillmentTabsProps {
  readonly value: OrderFulfillmentTab;
  readonly onChange: (value: OrderFulfillmentTab) => void;
}

export function OrderFulfillmentTabs({ value, onChange }: OrderFulfillmentTabsProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'orders.tabs' });

  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        onChange(next as OrderFulfillmentTab);
      }}
    >
      <TabsList className={TAB_LIST_CLASS}>
        {ORDER_FULFILLMENT_TABS.map((tab) => (
          <TabsTrigger key={tab} value={tab} className={TAB_TRIGGER_CLASS}>
            {t(tab)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

export const ORDER_STATUS_TABS = [
  'unaccepted',
  'accepted',
  'preparing',
  'ready',
  'completed',
  'canceled',
] as const satisfies readonly OrderStatusPreset[];

export type OrderStatusTab = (typeof ORDER_STATUS_TABS)[number];

export interface OrderStatusTabsProps {
  readonly value: OrderStatusPreset;
  readonly onChange: (value: OrderStatusPreset) => void;
  readonly counts: OrderFeedCountsApi | null;
  /** The failed-refund tab only exists while something is actually stuck. */
  readonly refundFailedCount: number;
}

export function OrderStatusTabs({
  value,
  onChange,
  counts,
  refundFailedCount,
}: OrderStatusTabsProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'orders.tabs' });

  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        onChange(next as OrderStatusPreset);
      }}
    >
      <TabsList className={cn(TAB_LIST_CLASS, 'w-full justify-start overflow-x-auto')}>
        {ORDER_STATUS_TABS.map((tab) => (
          <TabsTrigger key={tab} value={tab} className={cn(TAB_TRIGGER_CLASS, 'gap-1.5')}>
            {t(tab)}
            {counts !== null ? (
              <span className="text-muted-foreground tabular-nums">{counts[tab]}</span>
            ) : null}
          </TabsTrigger>
        ))}
        {refundFailedCount > 0 ? (
          <TabsTrigger
            value="refund_failed"
            className={cn(TAB_TRIGGER_CLASS, 'text-destructive gap-1.5')}
          >
            {t('refundFailed')}
            <span className="tabular-nums">{refundFailedCount}</span>
          </TabsTrigger>
        ) : null}
      </TabsList>
    </Tabs>
  );
}
