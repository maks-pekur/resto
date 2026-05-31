import { SetupChecklistCard } from '@/components/setup-checklist-card';
import { AiPreviewCard } from '@/components/ai-preview-card';
import { getMyBrands } from '@/lib/me-brands';

export default async function Page() {
  const brandsRes = await getMyBrands();
  const brandsCount = brandsRes.ok && brandsRes.data ? brandsRes.data.brands.length : 0;
  return (
    <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
      <div className="grid gap-4 md:grid-cols-2">
        <SetupChecklistCard brandsCount={brandsCount} />
        <AiPreviewCard />
      </div>
    </div>
  );
}
