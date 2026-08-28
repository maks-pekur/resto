'use client';

import { useMemo } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from '@resto/ui';

interface PaymentFormProps {
  returnUrl: string;
  onError: (message: string) => void;
  onSubmitting: (v: boolean) => void;
  isSubmitting: boolean;
}

function PaymentForm({ returnUrl, onError, onSubmitting, isSubmitting }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();

  const handleConfirm = async () => {
    if (!stripe || !elements) return;
    onSubmitting(true);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    });
    onError(result.error.message ?? 'Payment failed. Please try again.');
    onSubmitting(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <PaymentElement />
      <Button
        type="button"
        onClick={() => void handleConfirm()}
        disabled={isSubmitting || !stripe || !elements}
        className="w-full bg-[var(--primary,#16a34a)] text-white"
      >
        {isSubmitting ? 'Processing…' : 'Pay now'}
      </Button>
    </div>
  );
}

interface StripePaymentElementProps {
  publishableKey: string;
  clientSecret: string;
  connectedAccountId: string;
  returnUrl: string;
  onError: (message: string) => void;
  onSubmitting: (v: boolean) => void;
  isSubmitting: boolean;
}

export function StripePaymentElement({
  publishableKey,
  clientSecret,
  connectedAccountId,
  returnUrl,
  onError,
  onSubmitting,
  isSubmitting,
}: StripePaymentElementProps) {
  const stripePromise = useMemo(
    () => loadStripe(publishableKey, { stripeAccount: connectedAccountId }),
    [publishableKey, connectedAccountId],
  );

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <PaymentForm
        returnUrl={returnUrl}
        onError={onError}
        onSubmitting={onSubmitting}
        isSubmitting={isSubmitting}
      />
    </Elements>
  );
}
