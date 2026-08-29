import * as React from 'react';
import { fromLocalizedText } from '@/lib/menu/localized';
import { createRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { Route as menuLayoutRoute } from './_layout';
import { modifierGroupsQuery } from '@/lib/queries/catalog';
import { PageHeading } from '@/components/page-heading';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('tableName')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <TableRow
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
                  <TableCell className="font-medium">{fromLocalizedText(g.name)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}
