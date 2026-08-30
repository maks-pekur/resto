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
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHeadCell,
  DataTableHeaderRow,
  DataTableRow,
} from '@/components/common/data-table';
import { EmptyState } from '@/components/common/empty-state';

export const Route = createRoute({
  getParentRoute: () => menuLayoutRoute,
  path: '/modifier-groups',
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(modifierGroupsQuery()),
  component: ModifierGroupsPage,
});

function ModifierGroupsPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.modifierGroups' });
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(modifierGroupsQuery());
  const groups = data.data?.items ?? [];

  const goToNew = (): void => {
    void navigate({ to: '/menu/modifier-groups/$id', params: { id: 'new' } });
  };

  const goToGroup = (id: string): void => {
    void navigate({ to: '/menu/modifier-groups/$id', params: { id } });
  };

  return (
    <>
      <PageHeading
        title={t('pageTitle')}
        action={
          <Button size="sm" onClick={goToNew}>
            {t('addGroup')}
          </Button>
        }
      />
      <div className="px-4 lg:px-6">
        {groups.length === 0 ? (
          <EmptyState
            variant="empty"
            title={t('empty')}
            description={t('emptyDescription')}
            action={<Button onClick={goToNew}>{t('addGroup')}</Button>}
          />
        ) : (
          <DataTable>
            <DataTableHeaderRow>
              <DataTableHeadCell>{t('tableName')}</DataTableHeadCell>
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
                  <DataTableCell className="font-medium">{fromLocalizedText(g.name)}</DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </div>
    </>
  );
}
