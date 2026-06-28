const getStripePublishableKey = (): string => {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key || key === '') {
    throw new Error(
      'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set. Set a real publishable key in the environment.',
    );
  }
  if (process.env.NODE_ENV === 'production' && !key.startsWith('pk_live_')) {
    throw new Error(
      'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must be a live key (pk_live_...) in production.',
    );
  }
  return key;
};

export const stripePublishableKey = getStripePublishableKey();
