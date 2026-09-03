import * as React from 'react';
import { fromLocalizedText } from '@/lib/menu/localized';
import { createRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { Route as menuLayoutRoute } from './_layout';
import { modifierGroupsQuery } from '@/lib/queries/catalog';
import { PageHeading } from '@/components/common/page-heading';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHeadCell,
  DataTableHeaderRow,
  DataTableRow,
} from '@/components/common/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { IngredientCardGrid } from '@/components/menu/ingredient-card-grid';
import { IngredientFormSheet } from '@/components/menu/ingredient-form-sheet';
import type { IngredientApi } from '@/lib/queries/catalog';

export const Route = createRoute({
  getParentRoute: () => menuLayoutRoute,
  path: '/ingredients',
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(modifierGroupsQuery()),
  component: IngredientsPage,
});

function IngredientsPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.ingredients' });
  const { t: tGroups } = useTranslation('translation', { keyPrefix: 'menu.modifierGroups' });
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(modifierGroupsQuery());
  const groups = data.data?.items ?? [];
  const [editing, setEditing] = React.useState<IngredientApi | 'new' | null>(null);

  const goToNewGroup = (): void => {
    void navigate({ to: '/menu/ingredients/$id', params: { id: 'new' } });
  };

  const goToGroup = (id: string): void => {
    void navigate({ to: '/menu/ingredients/$id', params: { id } });
  };

  return (
    <>
      <Tabs defaultValue="ingredients" className="gap-4">
        <div className="px-4 lg:px-6">
          <TabsList>
            <TabsTrigger value="ingredients">{t('tabIngredients')}</TabsTrigger>
            <TabsTrigger value="groups">{t('tabGroups')}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="ingredients" className="flex flex-col gap-4">
          <div className="flex justify-end px-4 lg:px-6">
            <Button
              size="sm"
              onClick={() => {
                setEditing('new');
              }}
            >
              {t('addBtn')}
            </Button>
          </div>
          <div className="px-4 lg:px-6">
            <IngredientCardGrid
              onSelect={(ingredient) => {
                setEditing(ingredient);
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="groups">
          <PageHeading
            title={tGroups('pageTitle')}
            action={
              <Button size="sm" onClick={goToNewGroup}>
                {tGroups('addGroup')}
              </Button>
            }
          />
          <div className="px-4 lg:px-6">
            {groups.length === 0 ? (
              <EmptyState
                variant="empty"
                title={tGroups('empty')}
                description={tGroups('emptyDescription')}
                action={<Button onClick={goToNewGroup}>{tGroups('addGroup')}</Button>}
              />
            ) : (
              <DataTable>
                <DataTableHeaderRow>
                  <DataTableHeadCell>{tGroups('tableName')}</DataTableHeadCell>
                </DataTableHeaderRow>
                <DataTableBody>
                  {groups.map((g) => (
                    <DataTableRow
                      key={g.id}
                      className="cursor-pointer hover:bg-muted/50"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        goToGroup(g.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') goToGroup(g.id);
                      }}
                    >
                      <DataTableCell className="font-medium">
                        {fromLocalizedText(g.name)}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <IngredientFormSheet
        open={editing !== null}
        ingredient={editing === 'new' ? null : editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
    </>
  );
}
