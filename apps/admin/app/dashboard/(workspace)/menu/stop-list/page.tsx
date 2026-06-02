import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';
import { PageHeading } from '@/components/page-heading';
import { TodaysWidget } from '@/components/menu/todays-86-widget';
import { TodaysWidgetResetButton } from '@/components/menu/todays-86-reset-button-client';
import { apiFetch } from '@/lib/api-server';
import { apiFetchInternal } from '@/lib/api-server-internal';
import { StopListTableClient, type StopListItemApi } from './stop-list-table-client';

interface MeResponse {
  readonly kind?: string;
  readonly tenantId?: string;
  readonly baseRole?: 'owner' | 'admin' | 'staff';
}

export default async function StopListPage(): Promise<React.ReactElement> {
  const t = await getTranslations('menu.stopList');
  const tNav = await getTranslations('nav');
  const me = await apiFetch<MeResponse>('/v1/me');
  if (!me.ok || me.data?.kind !== 'operator' || !me.data.tenantId) {
    redirect('/login');
  }

  const stopListRes = await apiFetchInternal<readonly StopListItemApi[]>(
    '/internal/v1/catalog/stop-list',
  );
  const items = stopListRes.data ?? [];

  return (
    <>
      <PageHeading
        title={tNav('menuStopList')}
        action={items.length > 0 ? <TodaysWidgetResetButton /> : undefined}
      />
      <div className="flex flex-1 flex-col gap-6 px-4 lg:px-6">
        <TodaysWidget count={items.length} />
        {items.length === 0 ? (
          <EmptyState variant="empty" title={t('title')} description={t('titleDescription')} />
        ) : (
          <StopListTableClient items={items} />
        )}
      </div>
    </>
  );
}
