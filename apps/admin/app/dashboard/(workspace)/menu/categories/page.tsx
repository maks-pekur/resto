import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';
import { PageHeading } from '@/components/page-heading';
import { apiFetch } from '@/lib/api-server';
import { apiFetchInternal } from '@/lib/api-server-internal';
import { CategoriesTableClient } from './categories-table-client';
import { CreateCategoryButton } from './create-category-button-client';

interface MeResponse {
  readonly kind?: string;
  readonly tenantId?: string;
  readonly baseRole?: 'owner' | 'admin' | 'staff';
}

export interface CategoryListItemApi {
  readonly id: string;
  readonly parentId: string | null;
  readonly slug: string;
  readonly name: Record<string, string>;
  readonly description: Record<string, string> | null;
  readonly sortOrder: number;
  readonly status: 'draft' | 'published' | 'archived';
}

interface CategoryListResponseApi {
  readonly items: readonly CategoryListItemApi[];
}

export default async function CategoriesPage(): Promise<React.ReactElement> {
  const tCat = await getTranslations('menu.categories');
  const tAuth = await getTranslations('auth');
  const tCommon = await getTranslations('common');
  const tNav = await getTranslations('nav');
  const me = await apiFetch<MeResponse>('/v1/me');
  if (!me.ok || me.data?.kind !== 'operator' || !me.data.tenantId) {
    redirect('/login');
  }

  const res = await apiFetchInternal<CategoryListResponseApi>('/internal/v1/catalog/categories');

  const categoryItems = res.data?.items ?? [];

  return (
    <>
      <PageHeading
        title={tNav('menuCategories')}
        action={<CreateCategoryButton allCategories={categoryItems} />}
      />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        {res.status === 403 ? (
          <EmptyState
            variant="forbidden"
            title={tAuth('noAccess')}
            description={tAuth('noAccessDescription')}
          />
        ) : !res.ok || !res.data ? (
          <EmptyState
            variant="empty"
            title={tCat('loadFailed')}
            description={tCommon('tryAgain')}
          />
        ) : (
          <CategoriesTableClient categories={res.data.items} />
        )}
      </div>
    </>
  );
}
