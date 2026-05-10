'use server';

import { apiFetch } from '@/lib/api-server';

export interface SlugAvailabilityResult {
  readonly available: boolean;
  readonly suggestion: string | null;
  readonly error: string | null;
}

interface ApiResponse {
  available?: boolean;
  suggestion?: string | null;
}

/**
 * Live slug-availability check for the brand-creation form (RES-180).
 * Server action so the api receives the operator's BA cookie via
 * `apiFetch` — no client-side credentials handling needed. Returns a
 * single `SlugAvailabilityResult` shape so the form can branch on
 * `error`/`available` without parsing HTTP details.
 */
export async function checkBrandSlugAvailability(slug: string): Promise<SlugAvailabilityResult> {
  if (typeof slug !== 'string' || slug.length === 0) {
    return { available: false, suggestion: null, error: 'empty' };
  }
  const res = await apiFetch<ApiResponse>(
    `/v1/me/brands/slug-availability?slug=${encodeURIComponent(slug)}`,
  );
  if (res.status === 400) {
    return { available: false, suggestion: null, error: 'invalid' };
  }
  if (!res.ok || !res.data) {
    return { available: false, suggestion: null, error: 'network' };
  }
  return {
    available: res.data.available === true,
    suggestion: typeof res.data.suggestion === 'string' ? res.data.suggestion : null,
    error: null,
  };
}
