'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCartStore } from '@/hooks/use-cart-store';

export function DeliveryPickupBanner() {
  const mode = useCartStore((s) => s.mode);
  const setMode = useCartStore((s) => s.setMode);

  return (
    <div className="sticky top-16 z-40 flex h-12 w-full items-center border-b bg-[oklch(0.97_0_0)] px-4 sm:px-6">
      <Tabs
        value={mode ?? ''}
        onValueChange={(v) => {
          if (v === 'delivery' || v === 'pickup') setMode(v);
        }}
        className="w-full max-w-7xl mx-auto"
      >
        <TabsList className="h-8 bg-transparent gap-2 p-0">
          <TabsTrigger
            value="delivery"
            className="h-8 rounded-md border border-transparent px-4 text-sm data-[state=active]:border-[var(--primary,#16a34a)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--primary,#16a34a)] data-[state=active]:shadow-none"
          >
            Delivery
          </TabsTrigger>
          <TabsTrigger
            value="pickup"
            className="h-8 rounded-md border border-transparent px-4 text-sm data-[state=active]:border-[var(--primary,#16a34a)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--primary,#16a34a)] data-[state=active]:shadow-none"
          >
            Pickup
          </TabsTrigger>
          {!mode ? (
            <span className="ml-2 text-sm text-[oklch(0.45_0_0)]">
              How would you like to receive your order?
            </span>
          ) : null}
        </TabsList>
      </Tabs>
      {mode === 'delivery' ? (
        <div className="absolute inset-x-0 top-full border-b bg-[oklch(0.97_0_0)] px-4 py-2 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <p className="text-sm text-[oklch(0.45_0_0)]">
              Enter your delivery address at checkout.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
