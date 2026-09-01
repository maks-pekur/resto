import { apiFetch } from '@/lib/api-client';

export interface TenantContacts {
  readonly phone: string | null;
  readonly email: string | null;
  readonly website: string | null;
}

export interface TenantResponse {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
  readonly status: string;
  readonly locale: string;
  readonly contentLocales: readonly string[];
  readonly country: string;
  readonly defaultCurrency: string;
  readonly theme: {
    logoUrl: string | null;
    coverUrl: string | null;
    primaryColor: string | null;
    font: string | null;
  } | null;
  readonly description: Record<string, string> | null;
  readonly socials: Readonly<Record<string, string>>;
  readonly contacts: TenantContacts;
  readonly legalDocuments: LegalDocuments | null;
  readonly legalName: string | null;
  readonly legalForm: 'IP' | 'OOO' | 'LLC' | 'SOLE_PROP' | 'OTHER' | null;
  readonly taxId: string | null;
  readonly paymentProvider: 'stripe';
  readonly accountType: 'express' | 'standard' | null;
  readonly stripeChargesEnabled: boolean;
  readonly stripePayoutsEnabled: boolean;
  readonly stripeOnboardingStatus: 'not_started' | 'pending' | 'complete' | 'restricted';
  readonly stripeRequirementsDue: readonly string[] | null;
  readonly primaryDomain: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
  readonly offboardingScheduledAt: string | null;
  readonly offboardingExecutedAt: string | null;
  readonly offboardingRequestedBy: string | null;
}

export interface TenantDomainItem {
  readonly id: string;
  readonly domain: string;
  readonly kind: string;
  readonly isPrimary: boolean;
  readonly verifiedAt: string | null;
}

export interface ProblemDetails {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
}

export const tenancyQuery = () => ({
  queryKey: ['tenancy', 'me'] as const,
  queryFn: () => apiFetch<TenantResponse>('/v1/tenants/me'),
  staleTime: 30_000,
});

export const tenantDomainsQuery = () => ({
  queryKey: ['tenancy', 'me', 'domains'] as const,
  queryFn: () => apiFetch<TenantDomainItem[]>('/v1/tenants/me/domains'),
  staleTime: 30_000,
});

export const setContentLocales = async (input: {
  defaultLocale: string;
  contentLocales: readonly string[];
}) =>
  apiFetch<TenantResponse | ProblemDetails>('/v1/tenants/me/locales', {
    method: 'PATCH',
    body: input,
  });

export type LegalDocuments = Readonly<
  Record<
    'about' | 'payment' | 'returns' | 'cookies' | 'terms' | 'privacy',
    Record<string, string> | null
  >
>;

export interface UpdateBrandBody {
  readonly displayName?: string;
  readonly description?: Record<string, string> | null;
  readonly socials?: Record<string, string>;
  readonly contacts?: TenantContacts;
  readonly logoS3Key?: string | null;
  readonly coverS3Key?: string | null;
  readonly legalDocuments?: LegalDocuments | null;
}

export const updateBrand = async (body: UpdateBrandBody) =>
  apiFetch<TenantResponse | ProblemDetails>('/v1/tenants/me/brand', {
    method: 'PATCH',
    body,
  });

export interface BrandLogoUploadUrl {
  readonly uploadUrl: string;
  readonly s3Key: string;
}

export const getBrandLogoUploadUrl = async (input: { contentType: string; sizeBytes: number }) =>
  apiFetch<BrandLogoUploadUrl>('/v1/tenants/me/brand/logo-upload-url', {
    method: 'POST',
    body: input,
  });

export const scheduleOffboard = async (userId: string) =>
  apiFetch<TenantResponse | ProblemDetails>('/v1/tenants/me/offboard', {
    method: 'POST',
    body: { requestedBy: userId },
  });

export const cancelOffboard = async () =>
  apiFetch<TenantResponse | ProblemDetails>('/v1/tenants/me/offboard', {
    method: 'DELETE',
  });

export const friendlyOffboardError = (status: number, body: ProblemDetails | null): string => {
  if (status === 404) return 'Tenant not found.';
  if (status === 401) return 'Not authorized.';
  if (status === 403) return 'Owner role required.';
  if (status === 409) {
    const detail = body?.detail?.toLowerCase() ?? '';
    if (detail.includes('cool-off'))
      return 'Cool-off has expired; cancellation is no longer possible.';
    if (detail.includes('cannot be offboarded'))
      return 'Tenant is not in a state that allows this action.';
    return body?.detail ?? 'Conflict.';
  }
  return body?.detail ?? `Request failed (${status.toString()}).`;
};
