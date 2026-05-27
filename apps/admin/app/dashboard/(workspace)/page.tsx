import { TenantBreadcrumb } from '@/components/tenant-breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { SetupChecklistCard } from '@/components/setup-checklist-card';
import { AiPreviewCard } from '@/components/ai-preview-card';
import { getMyBrands } from '@/lib/me-brands';

export default async function Page() {
  const brandsRes = await getMyBrands();
  const brandsCount = brandsRes.ok && brandsRes.data ? brandsRes.data.brands.length : 0;
  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <TenantBreadcrumb trail="Overview" />
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="grid gap-4 md:grid-cols-2">
          <SetupChecklistCard brandsCount={brandsCount} />
          <AiPreviewCard />
        </div>
      </div>
    </>
  );
}
