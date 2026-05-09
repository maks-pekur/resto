import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { apiFetch } from '@/lib/api-server';

interface TenantSummary {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const res = await apiFetch<TenantSummary>('/v1/tenants/me');
  if (!res.ok || !res.data) {
    redirect('/login');
  }

  return (
    <SidebarProvider>
      <AppSidebar tenant={res.data} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
