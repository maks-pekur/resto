import { apiFetch } from '@/lib/api-client';

export type StripeOnboardingStatus = 'not_started' | 'pending' | 'complete' | 'restricted';

export interface TenantPaymentStatus {
  readonly accountType: 'express' | 'standard' | null;
  readonly onboardingStatus: StripeOnboardingStatus;
  readonly chargesEnabled: boolean;
  readonly payoutsEnabled: boolean;
  readonly canAcceptPayments: boolean;
  readonly requirementsDue: readonly string[] | null;
}

export const getTenantPaymentStatus = () =>
  apiFetch<TenantPaymentStatus>('/v1/tenancy/onboarding/status');

export const startTenantEmbeddedSession = () =>
  apiFetch<{ clientSecret: string }>('/v1/tenancy/onboarding/account-session', {
    method: 'POST',
  });

export const startTenantHostedLink = () =>
  apiFetch<{ onboardingUrl: string }>('/v1/tenancy/onboarding/account-link', {
    method: 'POST',
  });

export const startTenantOAuth = () =>
  apiFetch<{ authorizeUrl: string }>('/v1/tenancy/onboarding/oauth/start');
