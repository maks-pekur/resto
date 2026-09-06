import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openServiceRequestsQuery, resolveServiceRequest } from '@/lib/queries/service-requests';

export interface ServiceRequestsBarProps {
  readonly locationId: string;
}

/**
 * Raised hands, above the order feed: a table waiting for someone is more urgent than a ticket
 * already in the kitchen, and it disappears the moment a member of staff says they have it.
 */
export function ServiceRequestsBar({ locationId }: ServiceRequestsBarProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'orders.service' });
  const queryClient = useQueryClient();
  const { data } = useQuery(openServiceRequestsQuery(locationId));

  const resolve = useMutation({
    mutationFn: (id: string) => resolveServiceRequest(id, locationId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['service-requests'] });
    },
  });

  const items = data?.ok === true ? (data.data?.items ?? []) : [];
  if (items.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2 px-4 lg:px-6">
      {items.map((item) => (
        <li
          key={item.id}
          className="border-primary bg-primary-tint flex items-center gap-3 rounded-xl border px-3 py-2"
        >
          {item.kind === 'waiter' ? (
            <Bell className="size-4" />
          ) : (
            <ReceiptText className="size-4" />
          )}
          <span className="text-sm font-semibold">
            {t(item.kind === 'waiter' ? 'waiter' : 'bill', {
              zone: item.zoneName,
              number: item.tableNumber,
            })}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={resolve.isPending}
            onClick={() => {
              resolve.mutate(item.id);
            }}
          >
            {t('done')}
          </Button>
        </li>
      ))}
    </ul>
  );
}
