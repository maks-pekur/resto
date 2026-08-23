import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export type OrderCardState =
  | 'new'
  | 'escalated'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'canceled';

type Variant = 'default' | 'secondary' | 'outline' | 'destructive';

const VARIANTS: Record<OrderCardState, Variant> = {
  new: 'outline',
  escalated: 'destructive',
  accepted: 'secondary',
  preparing: 'outline',
  ready: 'outline',
  completed: 'outline',
  canceled: 'outline',
};

const EXTRA_CLASS: Partial<Record<OrderCardState, string>> = {
  new: 'border-primary text-primary',
  escalated: 'animate-pulse',
  preparing: 'border-transparent bg-warning text-warning-foreground',
  ready: 'border-transparent bg-success text-success-foreground',
  completed: 'text-muted-foreground',
  canceled: 'border-destructive text-destructive',
};

const LABEL_KEY: Record<OrderCardState, string> = {
  new: 'newBadge',
  escalated: 'escalatedBadge',
  accepted: 'acceptedBadge',
  preparing: 'preparingBadge',
  ready: 'readyBadge',
  completed: 'completedBadge',
  canceled: 'canceledBadge',
};

export interface OrderStatusBadgeProps {
  readonly state: OrderCardState;
  readonly escalatedDuration?: string;
}

export function OrderStatusBadge({
  state,
  escalatedDuration,
}: OrderStatusBadgeProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'orders.card' });
  const label =
    state === 'escalated'
      ? t(LABEL_KEY.escalated, { duration: escalatedDuration ?? '' })
      : t(LABEL_KEY[state]);
  return (
    <Badge variant={VARIANTS[state]} className={EXTRA_CLASS[state]}>
      {label}
    </Badge>
  );
}

export function OrderRefundFailedBadge(): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'orders.card' });
  return (
    <Badge variant="destructive" className="gap-1">
      <AlertTriangle className="size-3" />
      {t('refundFailedBadge')}
    </Badge>
  );
}
