import * as React from 'react';
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
import { StatusBadge } from '@/components/menu/status-badge';

export const Route = createRoute({
  getParentRoute: () => menuLayoutRoute,
  path: '/modifier-groups',
  loader: ({ context: { queryClient }, params: { brandSlug } }) =>
    queryClient.ensureQueryData(modifierGroupsQuery(brandSlug)),
  component: ModifierGroupsPage,
});

function ModifierGroupsPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.modifierGroups' });
  const { brandSlug } = Route.useParams();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(modifierGroupsQuery(brandSlug));
  const groups = data.data?.items ?? [];

  const goToNew = (): void => {
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call */
    void (navigate as any)({
      to: '/dashboard/$brandSlug/menu/modifier-groups/$id',
      params: { brandSlug, id: 'new' },
    });
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call */
  };

  const goToGroup = (id: string): void => {
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call */
    void (navigate as any)({
      to: '/dashboard/$brandSlug/menu/modifier-groups/$id',
      params: { brandSlug, id },
    });
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call */
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
                <TableHead className="w-[120px]">{t('tableStatus')}</TableHead>
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
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell>
                    <StatusBadge status={g.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}
