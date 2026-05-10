import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { apiFetch } from '@/lib/api-server';

interface TenantSummary {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
}

interface MeBrandsResponse {
  readonly brands: readonly { id: string; slug: string; displayName: string }[];
  readonly canViewAllBrands: boolean;
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [tenantRes, brandsRes, cookieStore] = await Promise.all([
    apiFetch<TenantSummary>('/v1/tenants/me'),
    apiFetch<MeBrandsResponse>('/v1/me/brands'),
    cookies(),
  ]);
  if (!tenantRes.ok || !tenantRes.data) {
    redirect('/login');
  }
  const brands = brandsRes.ok && brandsRes.data ? brandsRes.data.brands : [];
  const canViewAllBrands = brandsRes.ok && brandsRes.data ? brandsRes.data.canViewAllBrands : false;
  const activeBrandSlug = cookieStore.get('resto.active_brand')?.value ?? null;

  return (
    <SidebarProvider>
      <AppSidebar
        brands={brands}
        activeBrandSlug={activeBrandSlug}
        canViewAllBrands={canViewAllBrands}
      />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
