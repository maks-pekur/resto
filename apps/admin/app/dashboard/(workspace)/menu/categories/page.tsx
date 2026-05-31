import { redirect } from 'next/navigation';
import { TenantBreadcrumb } from '@/components/tenant-breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { EmptyState } from '@/components/empty-state';
import { apiFetch } from '@/lib/api-server';
import { apiFetchInternal } from '@/lib/api-server-internal';
import { CategoriesTableClient } from './categories-table-client';

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
  const me = await apiFetch<MeResponse>('/v1/me');
  if (!me.ok || me.data?.kind !== 'operator' || !me.data.tenantId) {
    redirect('/login');
  }

  const res = await apiFetchInternal<CategoryListResponseApi>('/internal/v1/catalog/categories');

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <TenantBreadcrumb trail="Меню › Категории" />
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {res.status === 403 ? (
          <EmptyState
            variant="forbidden"
            title="Нет доступа"
            description="У вас нет прав для управления меню. Обратитесь к владельцу аккаунта."
          />
        ) : !res.ok || !res.data ? (
          <EmptyState
            variant="empty"
            title="Не удалось загрузить категории"
            description="Попробуйте обновить страницу. Если проблема повторится, проверьте соединение."
          />
        ) : (
          <CategoriesTableClient categories={res.data.items} />
        )}
      </div>
    </>
  );
}
