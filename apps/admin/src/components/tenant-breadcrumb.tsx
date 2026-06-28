import { Breadcrumb, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';

export function TenantBreadcrumb({ trail }: { readonly trail: string }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbPage>{trail}</BreadcrumbPage>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
