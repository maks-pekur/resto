import 'server-only';
import { cache } from 'react';
import { apiFetch } from '@/lib/api-server';

export interface MeBrandsResponse {
  readonly brands: readonly { id: string; slug: string; displayName: string }[];
  readonly canViewAllBrands: boolean;
}

/**
 * Per-request memoized fetch of the operator's visible brands.
 *
 * Both `dashboard/layout.tsx` (renders the sidebar) and
 * `(workspace)/layout.tsx` (redirects to onboarding when empty) need the
 * same brand list. React's `cache()` deduplicates within a single
 * request so we make exactly one HTTP call regardless of how many
 * server-rendered ancestors read the result.
 */
export const getMyBrands = cache(async () => apiFetch<MeBrandsResponse>('/v1/me/brands'));
