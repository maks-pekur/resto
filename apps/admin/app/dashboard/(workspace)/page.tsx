import { SetupChecklistCard } from '@/components/setup-checklist-card';
import { AiPreviewCard } from '@/components/ai-preview-card';
import { TodaysWidget } from '@/components/menu/todays-86-widget';
import { apiFetchInternal } from '@/lib/api-server-internal';
import { getMyBrands } from '@/lib/me-brands';

interface StopListItemApi {
  readonly id: string;
}

export default async function Page() {
  const [brandsRes, stopListRes] = await Promise.all([
    getMyBrands(),
    apiFetchInternal<readonly StopListItemApi[]>('/internal/v1/catalog/stop-list'),
  ]);
  const brandsCount = brandsRes.ok && brandsRes.data ? brandsRes.data.brands.length : 0;
  const stopListCount = stopListRes.data?.length ?? 0;
  return (
    <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
      <div className="grid gap-4 md:grid-cols-2">
        <SetupChecklistCard brandsCount={brandsCount} />
        <AiPreviewCard />
        <TodaysWidget count={stopListCount} />
      </div>
    </div>
  );
}
