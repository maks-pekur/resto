import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TenantBreadcrumb } from '@/components/tenant-breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { apiFetch } from '@/lib/api-server';
import { apiFetchInternal } from '@/lib/api-server-internal';
import { coerceStatusFilter, type ItemListStatusFilter } from '@/lib/menu/zod-schemas';
import { fromLocalizedText } from '@/lib/menu/localized';
import type { Status } from '@/lib/menu/types';
import { ItemsTableClient } from './items-table-client';
import { ItemsFilterBarClient } from './items-filter-bar-client';

const PAGE_SIZE = 50;

interface MeResponse {
  readonly kind?: string;
  readonly tenantId?: string;
  readonly baseRole?: 'owner' | 'admin' | 'staff';
}

export interface ItemListItemApi {
  readonly id: string;
  readonly name: Record<string, string>;
  readonly categoryId: string;
  readonly categoryName: Record<string, string>;
  readonly parentCategoryName: Record<string, string> | null;
  readonly photoUrl: string | null;
  readonly basePrice: string;
  readonly currency: string;
  readonly status: Status;
  readonly hasSizes: boolean;
  readonly stoppedAt: string | null;
}

interface ItemListResponseApi {
  readonly items: readonly ItemListItemApi[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

interface CategoryRowApi {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: Record<string, string>;
}

interface CategoryListApi {
  readonly items: readonly CategoryRowApi[];
}

const buildItemsQuery = (params: {
  readonly status: ItemListStatusFilter;
  readonly categoryId: string | null;
  readonly q: string;
  readonly offset: number;
}): string => {
  const search = new URLSearchParams();
  // D-03: backend default already excludes archived; omit `status` to keep that behaviour.
  if (params.status !== 'all-except-archived') {
    search.set('status', params.status);
  }
  if (params.categoryId !== null && params.categoryId.length > 0) {
    search.set('categoryId', params.categoryId);
  }
  if (params.q.length > 0) {
    search.set('q', params.q);
  }
  search.set('limit', String(PAGE_SIZE));
  search.set('offset', String(params.offset));
  return `/internal/v1/catalog/items?${search.toString()}`;
};

interface ItemsPageProps {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}

export default async function ItemsPage(props: ItemsPageProps): Promise<React.ReactElement> {
  const me = await apiFetch<MeResponse>('/v1/me');
  if (!me.ok || me.data?.kind !== 'operator' || !me.data.tenantId) {
    redirect('/login');
  }

  const sp = await props.searchParams;
  const status = coerceStatusFilter(sp.status);
  const categoryId = typeof sp.category === 'string' && sp.category.length > 0 ? sp.category : null;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const pageNum = (() => {
    if (typeof sp.page !== 'string') return 1;
    const n = Number.parseInt(sp.page, 10);
    return Number.isFinite(n) && n >= 1 ? n : 1;
  })();
  const offset = (pageNum - 1) * PAGE_SIZE;

  const [itemsRes, categoriesRes] = await Promise.all([
    apiFetchInternal<ItemListResponseApi>(buildItemsQuery({ status, categoryId, q, offset })),
    apiFetchInternal<CategoryListApi>('/internal/v1/catalog/categories'),
  ]);

  const items = itemsRes.data?.items ?? [];
  const total = itemsRes.data?.total ?? 0;
  const categories = (categoriesRes.data?.items ?? []).map((c) => ({
    id: c.id,
    parentId: c.parentId,
    name: fromLocalizedText(c.name),
  }));

  const noFiltersApplied =
    status === 'all-except-archived' && categoryId === null && q.length === 0;

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
        <div className="flex w-full items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <TenantBreadcrumb trail="Меню › Блюда" />
          <div className="ml-auto">
            <Link href="/dashboard/menu/items/new">
              <Button size="sm">+ Добавить блюдо</Button>
            </Link>
          </div>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {itemsRes.status === 403 ? (
          <EmptyState
            variant="forbidden"
            title="Нет доступа"
            description="У вас нет прав для управления меню. Обратитесь к владельцу аккаунта."
          />
        ) : !itemsRes.ok ? (
          <EmptyState
            variant="empty"
            title="Не удалось загрузить блюда"
            description="Попробуйте обновить страницу. Если проблема повторится, проверьте соединение."
          />
        ) : (
          <>
            <ItemsFilterBarClient
              categories={categories}
              currentFilters={{ status, categoryId, q }}
            />
            {items.length === 0 && noFiltersApplied ? (
              <EmptyState
                variant="empty"
                title="Блюд пока нет"
                description="Добавьте первое блюдо, чтобы начать заполнять меню."
                action={
                  <Link href="/dashboard/menu/items/new">
                    <Button>+ Добавить блюдо</Button>
                  </Link>
                }
              />
            ) : (
              <ItemsTableClient
                items={items}
                totalCount={total}
                pagination={{ page: pageNum, pageSize: PAGE_SIZE }}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}
