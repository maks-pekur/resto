import { apiFetch } from '@/lib/api-client';

export interface MeResponse {
  readonly kind: 'operator' | 'customer' | 'anonymous';
  readonly userId?: string;
  readonly email?: string;
  readonly tenantId?: string;
  readonly baseRole?: 'owner' | 'admin' | 'staff';
  readonly twoFactorEnabled?: boolean;
  readonly permissions?: Record<string, readonly string[]>;
}

export interface OperatorSummary {
  readonly email: string;
  readonly baseRole?: 'owner' | 'admin' | 'staff';
}

export interface MeTenantsResponse {
  readonly tenants: readonly {
    id: string;
    slug: string;
    displayName: string;
    status: string;
  }[];
}

export const meQuery = () => ({
  queryKey: ['identity', 'me'] as const,
  queryFn: () => apiFetch<MeResponse>('/v1/me'),
  staleTime: 30_000,
});

export const meTenantsQuery = () => ({
  queryKey: ['identity', 'me-tenants'] as const,
  queryFn: () => apiFetch<MeTenantsResponse>('/v1/me/tenants'),
  staleTime: 30_000,
});

export const toOperatorSummary = (res: MeResponse): OperatorSummary | null => {
  if (res.kind !== 'operator' || !res.email) return null;
  return res.baseRole ? { email: res.email, baseRole: res.baseRole } : { email: res.email };
};
