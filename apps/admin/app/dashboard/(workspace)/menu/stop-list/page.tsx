import { redirect } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { TodaysWidget } from '@/components/menu/todays-86-widget';
import { apiFetch } from '@/lib/api-server';
import { apiFetchInternal } from '@/lib/api-server-internal';
import { StopListTableClient, type StopListItemApi } from './stop-list-table-client';

interface MeResponse {
  readonly kind?: string;
  readonly tenantId?: string;
  readonly baseRole?: 'owner' | 'admin' | 'staff';
}

export default async function StopListPage(): Promise<React.ReactElement> {
  const me = await apiFetch<MeResponse>('/v1/me');
  if (!me.ok || me.data?.kind !== 'operator' || !me.data.tenantId) {
    redirect('/login');
  }

  const stopListRes = await apiFetchInternal<readonly StopListItemApi[]>(
    '/internal/v1/catalog/stop-list',
  );
  const items = stopListRes.data ?? [];

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 lg:px-6">
      <TodaysWidget count={items.length} />
      {items.length === 0 ? (
        <EmptyState
          variant="empty"
          title="Стоп-лист пуст"
          description="Все позиции в меню сейчас доступны для заказа."
        />
      ) : (
        <StopListTableClient items={items} />
      )}
    </div>
  );
}
