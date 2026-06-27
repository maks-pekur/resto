import { apiFetch } from '@/lib/api-client';

export type StripeOnboardingStatus = 'not_started' | 'pending' | 'complete' | 'restricted';

export interface StripeStatusResponse {
  readonly onboardingStatus: StripeOnboardingStatus;
  readonly chargesEnabled: boolean;
  readonly payoutsEnabled: boolean;
  readonly canAcceptPayments: boolean;
  readonly requirementsDue: unknown;
}

export interface StripeOnboardingResponse {
  readonly onboardingUrl: string;
}

export const getStripeStatus = () => apiFetch<StripeStatusResponse>('/v1/tenancy/stripe-status');

export const startStripeOnboarding = () =>
  apiFetch<StripeOnboardingResponse>('/v1/tenancy/stripe-onboarding', { method: 'POST' });
