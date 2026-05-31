import { TenantBreadcrumb } from '@/components/tenant-breadcrumb';

export default async function BrandThemePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <div className="px-4 lg:px-6">
        <TenantBreadcrumb trail={`Brands / ${slug} / Theme`} />
      </div>
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <h1 className="text-2xl font-semibold">Theme</h1>
        <p className="text-muted-foreground text-sm">Per-brand theme editor ships with RES-91.</p>
      </div>
    </>
  );
}
