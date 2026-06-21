import { createRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Route as dashboardLayoutRoute } from './_layout';
import { meBrandsQuery } from '@/lib/queries/identity';
import { SetupChecklistCard } from '@/components/setup-checklist-card';
import { PageHeading } from '@/components/page-heading';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const Route = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/',
  component: DashboardPage,
});

function TodaysStopListPlaceholder() {
  const { t } = useTranslation('translation', { keyPrefix: 'menu.stopList' });
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{t('todayTitle')}</CardTitle>
          <Badge variant="secondary" aria-label={t('todayBadgeAria')}>
            0
          </Badge>
        </div>
        <CardDescription>{t('todayEmpty')}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function DashboardPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'dashboard' });
  const { data: brandsResult } = useSuspenseQuery(meBrandsQuery());
  const brandsCount = brandsResult.data?.brands.length ?? 0;

  return (
    <>
      <PageHeading title={t('title')} />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          <SetupChecklistCard brandsCount={brandsCount} />
          <TodaysStopListPlaceholder />
        </div>
      </div>
    </>
  );
}
