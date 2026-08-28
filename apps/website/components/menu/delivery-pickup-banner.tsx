'use client';

import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger } from '@resto/ui';
import { useCartStore } from '@/hooks/use-cart-store';

export function DeliveryPickupBanner() {
  const t = useTranslations('checkout');
  const mode = useCartStore((s) => s.mode);
  const setMode = useCartStore((s) => s.setMode);

  return (
    <div className="bg-muted border-b">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <Tabs
          value={mode ?? ''}
          onValueChange={(value) => {
            if (value === 'delivery' || value === 'pickup') setMode(value);
          }}
        >
          <TabsList className="h-auto gap-1 bg-transparent p-0">
            <TabsTrigger
              value="delivery"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground h-9 rounded-full px-4 text-sm font-bold data-[state=active]:shadow-none"
            >
              {t('deliveryMode')}
            </TabsTrigger>
            <TabsTrigger
              value="pickup"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground h-9 rounded-full px-4 text-sm font-bold data-[state=active]:shadow-none"
            >
              {t('pickupMode')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {mode == null ? <p className="text-muted-foreground text-sm">{t('modePrompt')}</p> : null}
      </div>
    </div>
  );
}
