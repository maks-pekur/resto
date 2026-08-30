import { useTranslation } from 'react-i18next';
import { ListOrdered, ShoppingBag, Truck, UtensilsCrossed } from 'lucide-react';
import { FilterTabs, type FilterTabItem } from '@/components/common/filter-tabs';
import type { OrderFeedCountsApi, OrderStatusPreset } from '@/lib/queries/orders';

export type OrderFulfillmentTab = 'all' | 'dine_in' | 'delivery' | 'pickup';

export const ORDER_FULFILLMENT_TABS = [
  { value: 'all', icon: ListOrdered },
  { value: 'dine_in', icon: UtensilsCrossed },
  { value: 'delivery', icon: Truck },
  { value: 'pickup', icon: ShoppingBag },
] as const satisfies readonly { value: OrderFulfillmentTab; icon: unknown }[];

export interface OrderFulfillmentTabsProps {
  readonly value: OrderFulfillmentTab;
  readonly onChange: (value: OrderFulfillmentTab) => void;
}

export function OrderFulfillmentTabs({ value, onChange }: OrderFulfillmentTabsProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'orders.tabs' });

  return (
    <FilterTabs
      value={value}
      onChange={onChange}
      items={ORDER_FULFILLMENT_TABS.map((tab) => ({
        value: tab.value,
        label: t(tab.value),
        icon: tab.icon,
      }))}
    />
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

  const items: FilterTabItem<OrderStatusPreset>[] = ORDER_STATUS_TABS.map((tab) => ({
    value: tab,
    label: t(tab),
    ...(counts === null ? {} : { count: counts[tab] }),
  }));
  if (refundFailedCount > 0) {
    items.push({
      value: 'refund_failed',
      label: t('refundFailed'),
      count: refundFailedCount,
      tone: 'destructive',
    });
  }

  return <FilterTabs value={value} onChange={onChange} items={items} stretch />;
}
