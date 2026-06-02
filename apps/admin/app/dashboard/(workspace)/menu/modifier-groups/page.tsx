import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { PageHeading } from '@/components/page-heading';
import { apiFetch } from '@/lib/api-server';
import { apiFetchInternal } from '@/lib/api-server-internal';
import { fromLocalizedText } from '@/lib/menu/localized';
import { ModifierGroupsTableClient, type ModifierGroupRow } from './modifier-groups-table-client';

interface MeResponse {
  readonly kind?: string;
  readonly tenantId?: string;
}

interface ModifierGroupListItemApi {
  readonly id: string;
  readonly name: Record<string, string>;
  readonly minSelectable: number;
  readonly maxSelectable: number;
  readonly optionCount: number;
  readonly usageCount: number;
}

interface ModifierGroupListApi {
  readonly items: readonly ModifierGroupListItemApi[];
}

export default async function ModifierGroupsPage(): Promise<React.ReactElement> {
  const t = await getTranslations('menu.modifierGroups');
  const tNav = await getTranslations('nav');
  const me = await apiFetch<MeResponse>('/v1/me');
  if (!me.ok || me.data?.kind !== 'operator' || !me.data.tenantId) {
    redirect('/login');
  }

  const res = await apiFetchInternal<ModifierGroupListApi>('/internal/v1/catalog/modifier-groups');
  const items = res.data?.items ?? [];
  const rows: readonly ModifierGroupRow[] = items.map((it) => ({
    id: it.id,
    name: fromLocalizedText(it.name),
    minSelectable: it.minSelectable,
    maxSelectable: it.maxSelectable,
    optionCount: it.optionCount,
    usageCount: it.usageCount,
  }));

  return (
    <>
      <PageHeading
        title={tNav('menuModifiers')}
        action={
          <Link href="/dashboard/menu/modifier-groups/new">
            <Button size="sm">{t('createGroup')}</Button>
          </Link>
        }
      />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        {rows.length === 0 ? (
          <EmptyState
            variant="empty"
            title={t('empty')}
            description={t('emptyDescription')}
            action={
              <Link href="/dashboard/menu/modifier-groups/new">
                <Button>{t('createGroupBtn')}</Button>
              </Link>
            }
          />
        ) : (
          <ModifierGroupsTableClient items={rows} />
        )}
      </div>
    </>
  );
}
