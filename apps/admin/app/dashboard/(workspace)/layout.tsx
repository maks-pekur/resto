import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api-server';

interface MeBrandsResponse {
  readonly brands: readonly { id: string; slug: string; displayName: string }[];
  readonly canViewAllBrands: boolean;
}

/**
 * Force first-brand creation: every workspace page (everything under the
 * `(workspace)` route group) requires the operator's tenant to have at
 * least one brand. When the list is empty, redirect to the onboarding
 * route at `/dashboard/brands/new`, which lives outside this group and
 * therefore bypasses this guard.
 */
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const res = await apiFetch<MeBrandsResponse>('/v1/me/brands');
  const brands = res.ok && res.data ? res.data.brands : [];
  if (brands.length === 0) {
    redirect('/dashboard/brands/new');
  }
  return <>{children}</>;
}
