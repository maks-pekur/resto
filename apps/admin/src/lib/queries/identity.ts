import { apiFetch } from '@/lib/api-client';

export interface MeResponse {
  readonly kind: 'operator' | 'customer' | 'anonymous';
  readonly userId?: string;
  readonly email?: string;
  readonly tenantId?: string;
  readonly baseRole?: 'owner' | 'admin' | 'staff';
  readonly twoFactorEnabled?: boolean;
  readonly activeBrandId?: string | null;
}

export interface OperatorSummary {
  readonly email: string;
  readonly baseRole?: 'owner' | 'admin' | 'staff';
}

export interface MeBrandsResponse {
  readonly brands: readonly { id: string; slug: string; displayName: string }[];
  readonly canViewAllBrands: boolean;
}

export const meQuery = () => ({
  queryKey: ['identity', 'me'] as const,
  queryFn: () => apiFetch<MeResponse>('/v1/me'),
  staleTime: 30_000,
});

export const meBrandsQuery = () => ({
  queryKey: ['identity', 'me-brands'] as const,
  queryFn: () => apiFetch<MeBrandsResponse>('/v1/me/brands'),
  staleTime: 30_000,
});

export const toOperatorSummary = (res: MeResponse): OperatorSummary | null => {
  if (res.kind !== 'operator' || !res.email) return null;
  return res.baseRole ? { email: res.email, baseRole: res.baseRole } : { email: res.email };
};
