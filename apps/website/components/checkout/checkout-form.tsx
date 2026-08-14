'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCartStore } from '@resto/cart';
import {
  createCheckoutSchema,
  type CheckoutFormInput,
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
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { AddressInput } from '@/components/checkout/address-input';
import { OrderTimeSelector } from '@/components/checkout/order-time-selector';
import { OrderSummary } from '@/components/checkout/order-summary';
import { StripePaymentElement } from '@/components/checkout/payment-element';
import {
  createOrder,
  createPaymentIntent,
  cartItemsToOrderItems,
  CheckoutApiError,
  type CreatePaymentIntentResponse,
} from '@/lib/checkout-api';
import { stripePublishableKey } from '@/lib/client-env';

type PaymentState =
  | { stage: 'idle' }
  | { stage: 'creating' }
  | {
      stage: 'payment';
      orderId: string;
      clientSecret: string;
      connectedAccountId: string;
    }
  | { stage: 'error'; orderId: string | null; message: string };

export function CheckoutForm() {
  const t = useTranslations('checkout');
  const mode = useCartStore((s) => s.mode);
  const items = useCartStore((s) => s.items);

  const [payment, setPayment] = useState<PaymentState>({ stage: 'idle' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CheckoutFormInput, unknown, CheckoutFormValues>({
    resolver: zodResolver(createCheckoutSchema(mode)),
    mode: 'onChange',
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      address: '',
      orderTime: { kind: 'asap' },
      marketingConsent: false,
    },
  });

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-[640px] px-4 py-16 text-center sm:px-6">
        <p className="text-[16px] leading-[1.5]">Your cart is empty</p>
        <Button asChild className="mt-4">
          <Link href="/">Back to menu</Link>
        </Button>
      </main>
    );
  }

  const resolvedMode = mode === 'delivery' ? 'delivery' : 'pickup';

  const handleSubmit = form.handleSubmit(async (values) => {
    setPayment({ stage: 'creating' });
    try {
      const orderResult = await createOrder({
        items: cartItemsToOrderItems(items),
        fulfillmentMode: resolvedMode,
        customerName: values.name,
        customerPhone: values.phone,
        customerEmail: values.email,
        idempotencyKey: crypto.randomUUID(),
        scheduledFor: values.orderTime.kind === 'scheduled' ? values.orderTime.at : undefined,
        marketingConsent: values.marketingConsent,
      });

      const pi = await createPaymentIntent(orderResult.orderId);
      setPayment({
        stage: 'payment',
        orderId: orderResult.orderId,
        clientSecret: pi.clientSecret,
        connectedAccountId: pi.connectedAccountId,
      });
    } catch (err) {
      const message =
        err instanceof CheckoutApiError ? err.message : 'Something went wrong. Please try again.';
      setPayment({ stage: 'error', orderId: null, message });
    }
  });

  const handleRetry = async (orderId: string) => {
    setPayment({ stage: 'creating' });
    try {
      const pi: CreatePaymentIntentResponse = await createPaymentIntent(orderId);
      setPayment({
        stage: 'payment',
        orderId,
        clientSecret: pi.clientSecret,
        connectedAccountId: pi.connectedAccountId,
      });
    } catch (err) {
      const message =
        err instanceof CheckoutApiError ? err.message : 'Something went wrong. Please try again.';
      setPayment({ stage: 'error', orderId, message });
    }
  };

  const confirmationUrl = (orderId: string): string =>
    `${typeof window !== 'undefined' ? window.location.origin : ''}/checkout/confirmation/${orderId}`;

  if (payment.stage === 'payment') {
    return (
      <main className="mx-auto max-w-[640px] px-4 py-8 sm:px-6">
        <StripePaymentElement
          publishableKey={stripePublishableKey}
          clientSecret={payment.clientSecret}
          connectedAccountId={payment.connectedAccountId}
          returnUrl={confirmationUrl(payment.orderId)}
          onError={(message) => {
            setPayment({ stage: 'error', orderId: payment.orderId, message });
          }}
          onSubmitting={setIsSubmitting}
          isSubmitting={isSubmitting}
        />
      </main>
    );
  }

  if (payment.stage === 'error') {
    return (
      <main className="mx-auto max-w-[640px] px-4 py-8 sm:px-6 flex flex-col gap-4">
        <p className="text-[16px] leading-[1.5] text-red-600">{payment.message}</p>
        {payment.orderId ? (
          <Button
            onClick={() => {
              const id = payment.orderId;
              if (id) void handleRetry(id);
            }}
            className="w-full bg-(--primary,#16a34a) text-white"
          >
            Try again
          </Button>
        ) : (
          <Button
            onClick={() => {
              setPayment({ stage: 'idle' });
            }}
            className="w-full bg-(--primary,#16a34a) text-white"
          >
            Try again
          </Button>
        )}
        <Button asChild variant="outline" className="w-full">
          <Link href="/">Back to menu</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[640px] px-4 py-8 sm:px-6">
      <Form {...form}>
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-6">
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
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="your@email.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="marketingConsent"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-start gap-2">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="font-normal">{t('consent.label')}</FormLabel>
                </div>
                <p className="text-[12px] leading-[1.4] text-[oklch(0.45_0_0)]">
                  {t('consent.hint')}
                </p>
                <FormMessage />
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

          <Button
            type="submit"
            disabled={payment.stage === 'creating'}
            className="w-full bg-(--primary,#16a34a) text-white"
          >
            {payment.stage === 'creating' ? 'Creating order…' : 'Place order'}
          </Button>
        </form>
      </Form>
    </main>
  );
}
