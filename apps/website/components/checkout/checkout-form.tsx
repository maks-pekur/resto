'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCartStore } from '@resto/cart';
import {
  createCheckoutSchema,
  type CheckoutForm as CheckoutFormValues,
} from '@/lib/checkout-schema';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AddressInput } from '@/components/checkout/address-input';
import { OrderTimeSelector } from '@/components/checkout/order-time-selector';
import { OrderSummary } from '@/components/checkout/order-summary';

export function CheckoutForm() {
  const mode = useCartStore((s) => s.mode);
  const itemCount = useCartStore((s) => s.items.length);

  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(createCheckoutSchema(mode)),
    mode: 'onChange',
    defaultValues: { name: '', phone: '', address: '', orderTime: { kind: 'asap' } },
  });

  if (itemCount === 0) {
    return (
      <main className="mx-auto max-w-[640px] px-4 py-16 text-center sm:px-6">
        <p className="text-[16px] leading-[1.5]">Your cart is empty</p>
        <Button asChild className="mt-4">
          <Link href="/">Back to menu</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[640px] px-4 py-8 sm:px-6">
      <Form {...form}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
          }}
          className="flex flex-col gap-6"
        >
          {mode === 'delivery' ? (
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delivery address</FormLabel>
                  <FormControl>
                    <AddressInput
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="Your name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input type="tel" placeholder="Your phone number" {...field} />
                </FormControl>
                <FormMessage />
                <p className="text-[12px] leading-[1.4] text-[oklch(0.45_0_0)]">
                  Create an account to track your orders (coming soon).
                </p>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="orderTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>When would you like your order?</FormLabel>
                <FormControl>
                  <OrderTimeSelector value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <OrderSummary />

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-block w-full">
                  <Button
                    type="submit"
                    disabled
                    aria-disabled="true"
                    aria-describedby="pay-coming-soon"
                    className="w-full bg-[var(--primary,#16a34a)] text-white"
                  >
                    Place order
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent id="pay-coming-soon">Payment processing coming soon</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </form>
      </Form>
    </main>
  );
}
