import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { acceptOrderMutation } from '@/lib/queries/orders';
import type { OrderFeedRowApi } from '@/lib/queries/orders';

const FIXED_MINUTES = [15, 20, 30, 45] as const;
const HIGHLIGHTED_MINUTES = 20;

export interface AcceptPopoverProps {
  readonly order: OrderFeedRowApi;
}

export function AcceptPopover({ order }: AcceptPopoverProps): React.ReactElement {
  const { t } = useTranslation('translation', { keyPrefix: 'orders' });
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [customOpen, setCustomOpen] = React.useState(false);
  const [customMinutes, setCustomMinutes] = React.useState('20');

  const mutation = useMutation({
    mutationFn: (prepMinutes: number) =>
      acceptOrderMutation({
        orderId: order.id,
        locationId: order.locationId,
        prepMinutes,
      }),
    onSuccess: (res) => {
      if (!res.ok || !res.data) {
        showError(null, t('accept.failedToast'));
        return;
      }
      setOpen(false);
      setCustomOpen(false);
      const etaTime = res.data.etaAt
        ? new Date(res.data.etaAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';
      showSuccess(t('accept.acceptedToast', { n: order.shortNumber, time: etaTime }));
      void queryClient.invalidateQueries({ queryKey: ['orders', 'feed'] });
    },
    onError: () => {
      showError(null, t('accept.failedToast'));
    },
  });

  const handleOpenChange = (next: boolean): void => {
    setOpen(next);
    if (!next) {
      setCustomOpen(false);
      setCustomMinutes('20');
    }
  };

  const confirmCustom = (): void => {
    const minutes = Number(customMinutes);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 180) return;
    mutation.mutate(minutes);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button size="lg" className="h-12 flex-1">
          {t('card.acceptBtn')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <p className="mb-3 text-sm font-semibold">{t('accept.title')}</p>
        <div className="flex flex-wrap gap-2">
          {FIXED_MINUTES.map((minutes) => (
            <Button
              key={minutes}
              type="button"
              variant={minutes === HIGHLIGHTED_MINUTES ? 'default' : 'outline'}
              className={cn(
                'h-12',
                minutes === HIGHLIGHTED_MINUTES ? 'flex-[1.3] text-base font-semibold' : 'flex-1',
              )}
              disabled={mutation.isPending}
              onClick={() => {
                mutation.mutate(minutes);
              }}
            >
              {t(`accept.chip${minutes}`)}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1"
            disabled={mutation.isPending}
            onClick={() => {
              setCustomOpen(true);
            }}
          >
            {t('accept.customChip')}
          </Button>
        </div>
        {customOpen ? (
          <div className="mt-3 flex items-center gap-2">
            <Input
              type="number"
              step={5}
              min={5}
              max={180}
              className="h-12"
              value={customMinutes}
              onChange={(event) => {
                setCustomMinutes(event.target.value);
              }}
              placeholder={t('accept.customPlaceholder')}
              aria-label={t('accept.customPlaceholder')}
            />
            <Button
              type="button"
              className="h-12"
              disabled={mutation.isPending}
              onClick={confirmCustom}
            >
              {t('accept.customConfirm')}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
