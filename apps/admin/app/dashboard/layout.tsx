import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { apiFetch } from '@/lib/api-server';
import { getMyBrands } from '@/lib/me-brands';

interface TenantSummary {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [tenantRes, brandsRes, cookieStore] = await Promise.all([
    apiFetch<TenantSummary>('/v1/tenants/me'),
    getMyBrands(),
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
