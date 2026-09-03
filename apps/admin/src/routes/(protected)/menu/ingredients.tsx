import * as React from 'react';
import { fromLocalizedText } from '@/lib/menu/localized';
import { createRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { Route as menuLayoutRoute } from './_layout';
import {
  ingredientStopListQuery,
  modifierGroupsQuery,
  toggleIngredientStopList,
} from '@/lib/queries/catalog';
import { useEffectiveLocation } from '@/hooks/use-effective-location';
import { PageHeading } from '@/components/common/page-heading';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
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
import { IngredientStopDialog } from '@/components/menu/ingredient-stop-dialog';
import { showError } from '@/lib/ui/toast-helpers';
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
  const { t: tStopList } = useTranslation('translation', { keyPrefix: 'menu.stopList' });
  const { t: tItems } = useTranslation('translation', { keyPrefix: 'menu.items' });
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(modifierGroupsQuery());
  const groups = data.data?.items ?? [];
  const [editing, setEditing] = React.useState<IngredientApi | 'new' | null>(null);
  const [stopping, setStopping] = React.useState<IngredientApi | null>(null);
  const { locationId } = useEffectiveLocation();
  const canStop = locationId !== undefined && locationId !== 'all';
  const queryClient = useQueryClient();

  const { data: stopListResult } = useQuery({
    ...ingredientStopListQuery(locationId ?? ''),
    enabled: canStop,
  });
  const stoppedOptionIds = React.useMemo(
    () => new Set((stopListResult?.data?.items ?? []).map((item) => item.optionId)),
    [stopListResult],
  );

  const resumeMutation = useMutation({
    mutationFn: (optionId: string) => toggleIngredientStopList(optionId, false, locationId ?? ''),
    onSuccess: (res) => {
      if (res.ok) {
        void queryClient.invalidateQueries({ queryKey: ['catalog', 'ingredient-stop-list'] });
      } else {
        showError(null, tItems('stopListFailed'));
      }
    },
  });

  const handleToggleStop = (ingredient: IngredientApi, next: boolean): void => {
    if (!next) {
      resumeMutation.mutate(ingredient.id);
      return;
    }
    setStopping(ingredient);
  };

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
              renderStopControl={
                canStop
                  ? (ingredient) => {
                      const isStopped = stoppedOptionIds.has(ingredient.id);
                      const name = fromLocalizedText(ingredient.name);
                      return (
                        <Switch
                          checked={isStopped}
                          disabled={resumeMutation.isPending || stopping?.id === ingredient.id}
                          onCheckedChange={(next) => {
                            handleToggleStop(ingredient, next);
                          }}
                          aria-label={
                            isStopped
                              ? tStopList('resumeAriaLabel', { name })
                              : tStopList('stopAriaLabel', { name })
                          }
                        />
                      );
                    }
                  : undefined
              }
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

      <IngredientStopDialog
        ingredient={stopping}
        locationId={locationId ?? ''}
        open={stopping !== null}
        onOpenChange={(open) => {
          if (!open) setStopping(null);
        }}
      />
    </>
  );
}
