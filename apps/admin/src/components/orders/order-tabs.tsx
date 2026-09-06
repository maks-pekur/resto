import { useTranslation } from 'react-i18next';
import { ListOrdered, ShoppingBag, Truck, UtensilsCrossed } from 'lucide-react';
import { FilterTabs, type FilterTabItem } from '@/components/common/filter-tabs';
import type { OrderFeedCountsApi, OrderStatusPreset } from '@/lib/queries/orders';

export type OrderTypeTab = 'all' | 'dine_in' | 'delivery' | 'pickup';

export const ORDER_TYPE_TABS = [
  { value: 'all', icon: ListOrdered },
  { value: 'dine_in', icon: UtensilsCrossed },
  { value: 'delivery', icon: Truck },
  { value: 'pickup', icon: ShoppingBag },
] as const satisfies readonly { value: OrderTypeTab; icon: unknown }[];

export interface OrderTypeTabsProps {
  readonly value: OrderTypeTab;
  readonly onChange: (value: OrderTypeTab) => void;
}

export function OrderTypeTabs({ value, onChange }: OrderTypeTabsProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'orders.tabs' });

  return (
    <FilterTabs
      value={value}
      onChange={onChange}
      items={ORDER_TYPE_TABS.map((tab) => ({
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
}

export function OrderStatusTabs({ value, onChange, counts }: OrderStatusTabsProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'orders.tabs' });

  const items: readonly FilterTabItem<OrderStatusPreset>[] = ORDER_STATUS_TABS.map((tab) => ({
    value: tab,
    label: t(tab),
    ...(counts === null ? {} : { count: counts[tab] }),
  }));

  return <FilterTabs value={value} onChange={onChange} items={items} stretch />;
}
