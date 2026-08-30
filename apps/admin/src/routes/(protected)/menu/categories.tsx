import { createRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Route as menuLayoutRoute } from './_layout';
import { categoriesQuery } from '@/lib/queries/catalog';
import { PageHeading } from '@/components/common/page-heading';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CategoriesTable } from '@/components/menu/categories-table';
import { CategoryForm } from '@/components/menu/category-form';
import * as React from 'react';

export const Route = createRoute({
  getParentRoute: () => menuLayoutRoute,
  path: '/categories',
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(categoriesQuery()),
  component: CategoriesPage,
});

function CategoriesPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.categories' });
  const { data } = useSuspenseQuery(categoriesQuery());
  const categories = data.data?.items ?? [];
  const [createOpen, setCreateOpen] = React.useState(false);

  return (
    <>
      <PageHeading
        title={t('pageTitle')}
        action={
          <Button
            size="sm"
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            {t('addCategory')}
          </Button>
        }
      />
      <div className="px-4 lg:px-6">
        <CategoriesTable categories={categories} />
      </div>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>{t('createSheetTitle')}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">
            <CategoryForm
              mode="create"
              allCategories={categories}
              onClose={() => {
                setCreateOpen(false);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
