import { useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { VITE_STRIPE_PUBLISHABLE_KEY } from '../env';
import { t } from '../i18n';

const PaymentForm = () => {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async (): Promise<void> => {
    if (!stripe || !elements) return;
    setBusy(true);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
    });
    setError(result.error.message ?? t('order.payFailed'));
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <PaymentElement />
      <button
        type="button"
        disabled={busy || !stripe || !elements}
        onClick={() => {
          void confirm();
        }}
        className="bg-primary text-primary-foreground flex h-12 w-full cursor-pointer items-center justify-center rounded-full px-5 text-base font-bold disabled:opacity-50"
      >
        {busy ? t('order.payLoading') : t('order.payNow')}
      </button>
      {error === null ? null : <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
};

export interface StripeCheckoutProps {
  readonly clientSecret: string;
  readonly connectedAccountId: string;
}

export const StripeCheckout = ({ clientSecret, connectedAccountId }: StripeCheckoutProps) => {
  const stripePromise = useMemo(
    () => loadStripe(VITE_STRIPE_PUBLISHABLE_KEY, { stripeAccount: connectedAccountId }),
    [connectedAccountId],
  );

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <PaymentForm />
    </Elements>
  );
};
