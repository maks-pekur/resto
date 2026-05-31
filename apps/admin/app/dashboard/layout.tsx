import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { CSSProperties } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { apiFetch } from '@/lib/api-server';
import { readActiveBrand, signActiveBrand } from '@/lib/active-brand-cookie';
import { getMe, toOperatorSummary } from '@/lib/me';
import { getMyBrands } from '@/lib/me-brands';

interface TenantSummary {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
}

const sidebarStyle: CSSProperties = {
  '--sidebar-width': '16rem',
  '--sidebar-width-icon': '3rem',
  '--header-height': 'calc(var(--spacing) * 14)',
} as CSSProperties;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [tenantRes, brandsRes, meRes, cookieBrandSlug] = await Promise.all([
    apiFetch<TenantSummary>('/v1/tenants/me'),
    getMyBrands(),
    getMe(),
    readActiveBrand(),
  ]);
  if (!tenantRes.ok || !tenantRes.data) {
    redirect('/login');
  }
  if (!meRes.ok || !meRes.data) {
    redirect('/login');
  }
  const operator = toOperatorSummary(meRes.data);
  if (!operator) {
    redirect('/login');
  }
  const brands = brandsRes.ok && brandsRes.data ? brandsRes.data.brands : [];

  if (brands.length === 0) {
    redirect('/onboarding/brand');
  }

  let activeBrandSlug = cookieBrandSlug;
  if (!activeBrandSlug || !brands.find((b) => b.slug === activeBrandSlug)) {
    const fallback = brands[0]?.slug ?? null;
    if (fallback) {
      const cookieStore = await cookies();
      cookieStore.set('resto.active_brand', signActiveBrand(fallback), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });
      activeBrandSlug = fallback;
    }
  }

  return (
    <SidebarProvider style={sidebarStyle}>
      <AppSidebar brands={brands} activeBrandSlug={activeBrandSlug} operator={operator} />
      <SidebarInset>
        <SiteHeader />
        <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
