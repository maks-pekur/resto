import type { TenantSnapshot } from '../../domain/tenant.aggregate';

export interface TenantResponse {
  id: string;
  slug: string;
  displayName: string;
  status: string;
  locale: string;
  defaultCurrency: string;
  primaryDomain: string;
  stripeAccountId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export const toResponse = (s: TenantSnapshot): TenantResponse => ({
  id: s.id,
  slug: s.slug,
  displayName: s.displayName,
  status: s.status,
  locale: s.locale,
  defaultCurrency: s.defaultCurrency,
  primaryDomain: s.primaryDomain.domain,
  stripeAccountId: s.stripeAccountId,
  createdAt: s.createdAt.toISOString(),
  updatedAt: s.updatedAt.toISOString(),
  archivedAt: s.archivedAt?.toISOString() ?? null,
});
