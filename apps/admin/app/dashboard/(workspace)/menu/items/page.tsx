import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { PageHeading } from '@/components/page-heading';
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
  const tItems = await getTranslations('menu.items');
  const tAuth = await getTranslations('auth');
  const tCommon = await getTranslations('common');
  const tNav = await getTranslations('nav');
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
      <PageHeading
        title={tNav('menuItems')}
        action={
          <Link href="/dashboard/menu/items/new">
            <Button size="sm">{tItems('addItem')}</Button>
          </Link>
        }
      />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        {itemsRes.status === 403 ? (
          <EmptyState
            variant="forbidden"
            title={tAuth('noAccess')}
            description={tAuth('noAccessDescription')}
          />
        ) : !itemsRes.ok ? (
          <EmptyState
            variant="empty"
            title={tItems('loadFailed')}
            description={tCommon('tryAgain')}
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
                title={tItems('empty')}
                description={tItems('emptyDescription')}
                action={
                  <Link href="/dashboard/menu/items/new">
                    <Button>{tItems('addItem')}</Button>
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
