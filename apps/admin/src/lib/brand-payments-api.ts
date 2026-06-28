import { apiFetch } from '@/lib/api-client';

export type BrandOnboardingStatus = 'not_started' | 'pending' | 'complete' | 'restricted';

export interface BrandPaymentStatus {
  readonly accountType: 'express' | 'standard' | null;
  readonly onboardingStatus: BrandOnboardingStatus;
  readonly chargesEnabled: boolean;
  readonly payoutsEnabled: boolean;
  readonly canAcceptPayments: boolean;
  readonly requirementsDue: unknown;
}

export const getBrandPaymentStatus = (brandSlug: string) =>
  apiFetch<BrandPaymentStatus>(`/v1/tenancy/brands/${brandSlug}/onboarding/status`, { brandSlug });

export const startBrandEmbeddedSession = (brandSlug: string) =>
  apiFetch<{ clientSecret: string }>(`/v1/tenancy/brands/${brandSlug}/onboarding/account-session`, {
    method: 'POST',
    brandSlug,
  });

export const startBrandHostedLink = (brandSlug: string) =>
  apiFetch<{ onboardingUrl: string }>(`/v1/tenancy/brands/${brandSlug}/onboarding/account-link`, {
    method: 'POST',
    brandSlug,
  });
