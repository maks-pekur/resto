import 'server-only';
import { cache } from 'react';
import { apiFetch } from '@/lib/api-server';

export interface MeResponse {
  readonly kind: 'operator' | 'customer' | 'anonymous';
  readonly userId?: string;
  readonly email?: string;
  readonly tenantId?: string;
  readonly baseRole?: 'owner' | 'admin' | 'staff';
}

export interface OperatorSummary {
  readonly email: string;
  readonly baseRole?: 'owner' | 'admin' | 'staff';
}

/**
 * Per-request memoized fetch of the current operator's identity.
 *
 * Wraps `apiFetch<MeResponse>('/v1/me')` with React's `cache()` so the
 * dashboard layout can fan out alongside `/v1/tenants/me` and
 * `/v1/me/brands` without making redundant identity calls. Mirrors the
 * pattern in `lib/me-brands.ts`.
 */
export const getMe = cache(async () => apiFetch<MeResponse>('/v1/me'));

/**
 * Project a `/v1/me` response into the minimum shape `<NavUser>` needs.
 * Returns `null` for non-operator principals so the caller can redirect
 * to `/login` rather than render a half-built sidebar (CONTEXT D-16).
 */
export const toOperatorSummary = (res: MeResponse): OperatorSummary | null => {
  if (res.kind !== 'operator' || !res.email) return null;
  return res.baseRole ? { email: res.email, baseRole: res.baseRole } : { email: res.email };
};
