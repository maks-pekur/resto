import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
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
    <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
      <div className="flex items-center justify-end gap-2">
        <Link href="/dashboard/menu/modifier-groups/new">
          <Button size="sm">+ Создать группу</Button>
        </Link>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          variant="empty"
          title="Нет групп модификаторов"
          description="Создайте первую группу, чтобы добавлять дополнения к блюдам."
          action={
            <Link href="/dashboard/menu/modifier-groups/new">
              <Button>Создать группу</Button>
            </Link>
          }
        />
      ) : (
        <ModifierGroupsTableClient items={rows} />
      )}
    </div>
  );
}
