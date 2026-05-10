import { redirect } from 'next/navigation';
import { getMyBrands } from '@/lib/me-brands';

/**
 * Force first-brand creation: every workspace page (everything under the
 * `(workspace)` route group) requires the operator's tenant to have at
 * least one brand. When the list is empty, redirect to the onboarding
 * route at `/onboarding/brand`, which lives in its own top-level
 * `(onboarding)` route group and therefore bypasses this guard.
 *
 * Shares its `/v1/me/brands` fetch with the outer dashboard layout via
 * React's `cache()` helper in `@/lib/me-brands` — exactly one HTTP
 * call per request despite two layouts reading the result.
 */
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const res = await getMyBrands();
  const brands = res.ok && res.data ? res.data.brands : [];
  if (brands.length === 0) {
    redirect('/onboarding/brand');
  }
  return <>{children}</>;
}
