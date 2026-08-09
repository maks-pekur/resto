import * as React from 'react';
import { createRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { Route as menuLayoutRoute } from './_layout';
import { itemsQuery, categoriesQuery } from '@/lib/queries/catalog';
import { useEffectiveLocation } from '@/lib/hooks/use-effective-location';
import { coerceStatusFilter } from '@/lib/menu/zod-schemas';
import { fromLocalizedText } from '@/lib/menu/localized';
import { PageHeading } from '@/components/page-heading';
import { Button } from '@/components/ui/button';
import { ItemsTable } from '@/components/menu/items-table';
import { ItemsFilterBar } from '@/components/menu/items-filter-bar';
import type { ItemListStatusFilter } from '@/lib/menu/zod-schemas';

const PAGE_SIZE = 50;

const searchSchema = z.object({
  page: z.number().int().positive().catch(1),
  status: z.string().optional(),
  categoryId: z.string().optional(),
  q: z.string().optional(),
});

export const Route = createRoute({
  getParentRoute: () => menuLayoutRoute,
  path: '/items',
  validateSearch: searchSchema,
  loader: ({ context: { queryClient }, params: { brandSlug } }) =>
    Promise.all([
      queryClient.ensureQueryData(itemsQuery(brandSlug, { limit: PAGE_SIZE, offset: 0 })),
      queryClient.ensureQueryData(categoriesQuery(brandSlug)),
    ]),
  component: ItemsPage,
});

function ItemsPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.items' });
  const { brandSlug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const status = coerceStatusFilter(search.status);
  const categoryId = search.categoryId ?? null;
  const q = search.q ?? '';
  const page = search.page;

  const { data: itemsResult } = useSuspenseQuery(
    itemsQuery(brandSlug, {
      status,
      categoryId,
      q: q || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
  );
  const { data: catResult } = useSuspenseQuery(categoriesQuery(brandSlug));
  const { locationId } = useEffectiveLocation();
  const stopListLocationId =
    locationId !== undefined && locationId !== 'all' ? locationId : undefined;

  const items = itemsResult.data?.items ?? [];
  const total = itemsResult.data?.total ?? 0;
  const categories = catResult.data?.items ?? [];

  const setSearch = (
    patch: Partial<{
      status: ItemListStatusFilter;
      categoryId: string | null;
      q: string;
      page: number;
    }>,
  ) => {
    void navigate({
      search: (prev) => ({
        ...prev,
        ...patch,
        categoryId: patch.categoryId ?? prev.categoryId,
        page: 'page' in patch ? patch.page : 1,
      }),
    });
  };

  return (
    <>
      <PageHeading
        title={t('pageTitle')}
        action={
          <Button
            size="sm"
            onClick={() => {
              /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call */
              void (navigate as any)({
                to: '/dashboard/$brandSlug/menu/items/$id',
                params: { brandSlug, id: 'new' },
              });
              /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call */
            }}
          >
            {t('addItem')}
          </Button>
        }
      />
      <div className="flex flex-col gap-4 px-4 lg:px-6">
        <ItemsFilterBar
          categories={categories.map((c) => ({
            id: c.id,
            name: fromLocalizedText(c.name),
            parentId: c.parentId,
          }))}
          status={status}
          categoryId={categoryId}
          q={q}
          onStatusChange={(s) => {
            setSearch({ status: s });
          }}
          onCategoryChange={(cid) => {
            setSearch({ categoryId: cid });
          }}
          onQChange={(v) => {
            setSearch({ q: v || undefined });
          }}
        />
        <ItemsTable
          brandSlug={brandSlug}
          items={items}
          totalCount={total}
          pagination={{ page, pageSize: PAGE_SIZE }}
          onPageChange={(p) => {
            setSearch({ page: p });
          }}
          stopListLocationId={stopListLocationId}
        />
      </div>
    </>
  );
}
