import { lazy, Suspense, useState } from 'react';
import { startPayment, OrderRequestError } from '../api/client';
import { t } from '../i18n';

// Stripe is the heaviest thing this app can load, and a guest paying the waiter never needs it.
const StripeCheckout = lazy(async () => ({
  default: (await import('./StripeCheckout')).StripeCheckout,
}));

export interface PayNowProps {
  readonly orderId: string;
}

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'starting' }
  | { readonly kind: 'ready'; readonly clientSecret: string; readonly account: string }
  | { readonly kind: 'error' };

export const PayNow = ({ orderId }: PayNowProps) => {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const start = (): void => {
    setState({ kind: 'starting' });
    startPayment(orderId)
      .then((session) => {
        setState({
          kind: 'ready',
          clientSecret: session.clientSecret,
          account: session.connectedAccountId,
        });
      })
      .catch((cause: unknown) => {
        setState({ kind: 'error' });
        if (!(cause instanceof OrderRequestError)) throw cause;
      });
  };

  if (state.kind === 'ready') {
    return (
      <Suspense fallback={<p className="text-muted-foreground text-sm">{t('order.payLoading')}</p>}>
        <StripeCheckout clientSecret={state.clientSecret} connectedAccountId={state.account} />
      </Suspense>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={state.kind === 'starting'}
        onClick={start}
        className="bg-primary text-primary-foreground focus-visible:ring-ring flex h-12 w-full cursor-pointer items-center justify-center rounded-full px-5 text-base font-bold transition-transform active:scale-[0.99] focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
      >
        {state.kind === 'starting' ? t('order.payLoading') : t('order.payNow')}
      </button>
      {state.kind === 'error' ? (
        <p className="text-destructive text-sm">{t('order.payFailed')}</p>
      ) : null}
    </div>
  );
};
