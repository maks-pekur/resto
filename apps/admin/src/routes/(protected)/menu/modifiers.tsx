import * as React from 'react';
import { fromLocalizedText } from '@/lib/menu/localized';
import { createRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { Route as menuLayoutRoute } from './_layout';
import {
  modifierStopListQuery,
  modifierGroupsQuery,
  toggleModifierStopList,
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
import { ModifierTable } from '@/components/menu/modifier-table';
import { ModifierFormSheet } from '@/components/menu/modifier-form-sheet';
import { ModifierStopDialog } from '@/components/menu/modifier-stop-dialog';
import { showError } from '@/lib/ui/toast-helpers';
import type { ModifierApi } from '@/lib/queries/catalog';

export const Route = createRoute({
  getParentRoute: () => menuLayoutRoute,
  path: '/modifiers',
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(modifierGroupsQuery()),
  component: ModifiersPage,
});

function ModifiersPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.modifiers' });
  const { t: tGroups } = useTranslation('translation', { keyPrefix: 'menu.modifierGroups' });
  const { t: tStopList } = useTranslation('translation', { keyPrefix: 'menu.stopList' });
  const { t: tItems } = useTranslation('translation', { keyPrefix: 'menu.items' });
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(modifierGroupsQuery());
  const groups = data.data?.items ?? [];
  const [editing, setEditing] = React.useState<ModifierApi | 'new' | null>(null);
  const [stopping, setStopping] = React.useState<ModifierApi | null>(null);
  const { locationId } = useEffectiveLocation();
  const canStop = locationId !== undefined && locationId !== 'all';
  const queryClient = useQueryClient();

  const { data: stopListResult } = useQuery({
    ...modifierStopListQuery(locationId ?? ''),
    enabled: canStop,
  });
  const stoppedOptionIds = React.useMemo(
    () => new Set((stopListResult?.data?.items ?? []).map((item) => item.optionId)),
    [stopListResult],
  );

  const resumeMutation = useMutation({
    mutationFn: (optionId: string) => toggleModifierStopList(optionId, false, locationId ?? ''),
    onSuccess: (res) => {
      if (res.ok) {
        void queryClient.invalidateQueries({ queryKey: ['catalog', 'modifier-stop-list'] });
      } else {
        showError(null, tItems('stopListFailed'));
      }
    },
  });

  const handleToggleStop = (modifier: ModifierApi, next: boolean): void => {
    if (!next) {
      resumeMutation.mutate(modifier.id);
      return;
    }
    setStopping(modifier);
  };

  const goToNewGroup = (): void => {
    void navigate({ to: '/menu/modifiers/$id', params: { id: 'new' } });
  };

  const goToGroup = (id: string): void => {
    void navigate({ to: '/menu/modifiers/$id', params: { id } });
  };

  return (
    <>
      <Tabs defaultValue="modifiers" className="gap-4">
        <div className="px-4 lg:px-6">
          <TabsList>
            <TabsTrigger value="modifiers">{t('tabModifiers')}</TabsTrigger>
            <TabsTrigger value="groups">{t('tabGroups')}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="modifiers" className="flex flex-col gap-4">
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
            <ModifierTable
              onSelect={(modifier) => {
                setEditing(modifier);
              }}
              renderStopControl={
                canStop
                  ? (modifier) => {
                      const isStopped = stoppedOptionIds.has(modifier.id);
                      const name = fromLocalizedText(modifier.name);
                      return (
                        <Switch
                          checked={isStopped}
                          disabled={resumeMutation.isPending || stopping?.id === modifier.id}
                          onCheckedChange={(next) => {
                            handleToggleStop(modifier, next);
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

      <ModifierFormSheet
        open={editing !== null}
        modifier={editing === 'new' ? null : editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />

      <ModifierStopDialog
        modifier={stopping}
        locationId={locationId ?? ''}
        open={stopping !== null}
        onOpenChange={(open) => {
          if (!open) setStopping(null);
        }}
      />
    </>
  );
}
