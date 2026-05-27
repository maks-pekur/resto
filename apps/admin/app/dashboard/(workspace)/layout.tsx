import Link from 'next/link';
import { getMyBrands } from '@/lib/me-brands';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';

/**
 * Workspace layout: when the operator's tenant has zero brands, render an
 * inline EmptyState on `/dashboard` instead of redirecting to onboarding
 * (CONTEXT D-07 + D-12). Sidebar stays mounted so the operator can see
 * they're signed in and can recover via the inline CTA.
 *
 * Shares its `/v1/me/brands` fetch with the outer dashboard layout via
 * React's `cache()` helper in `@/lib/me-brands` — exactly one HTTP call
 * per request despite two layouts reading the result.
 */
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const res = await getMyBrands();
  const brands = res.ok && res.data ? res.data.brands : [];
  if (brands.length === 0) {
    return (
      <EmptyState
        variant="empty"
        title="Your tenant has no brands yet"
        description="Create your first brand to start publishing your menu."
        action={
          <Button asChild>
            <Link href="/onboarding/brand">Create your first brand</Link>
          </Button>
        }
      />
    );
  }
  return <>{children}</>;
}
