import { createRoute, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Route as protectedLayoutRoute } from './_layout';
import { requirePermission } from '@/lib/auth/permissions';
import { meQuery } from '@/lib/queries/identity';
import { tenancyQuery } from '@/lib/queries/tenancy';
import { PageHeading } from '@/components/common/page-heading';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BrandForm } from '@/components/settings/brand-form';
import { ContentLocalesSection } from '@/components/settings/content-locales-section';
import { DangerZoneCard } from '@/components/settings/danger-zone-card';
import { TwoFactorSection } from '@/components/settings/two-factor-section';

const TABS = ['brand', 'security', 'danger'] as const;

const searchSchema = z.object({
  tab: z.enum(TABS).catch('brand'),
});

export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/settings',
  validateSearch: searchSchema,
  beforeLoad: requirePermission('settings', 'update'),
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(meQuery()),
      queryClient.ensureQueryData(tenancyQuery()),
    ]),
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'settings' });
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: meResult } = useSuspenseQuery(meQuery());
  const { data: tenantResult } = useSuspenseQuery(tenancyQuery());

  const me = meResult.data;
  const tenant = tenantResult.data;

  if (me?.kind !== 'operator' || !me.tenantId || !tenant) {
    return null;
  }

  const isOwner = me.baseRole === 'owner';

  return (
    <>
      <PageHeading title={t('pageTitle')} />
      <div className="flex flex-1 flex-col gap-4 px-4 lg:px-6">
        <Tabs
          value={tab}
          onValueChange={(next) => {
            void navigate({ search: { tab: next } });
          }}
        >
          <TabsList>
            <TabsTrigger value="brand">{t('tabBrand')}</TabsTrigger>
            <TabsTrigger value="security">{t('tabSecurity')}</TabsTrigger>
            <TabsTrigger value="danger">{t('tabDanger')}</TabsTrigger>
          </TabsList>

          <TabsContent value="brand" className="flex flex-col gap-4">
            <BrandForm tenant={tenant} />
            <ContentLocalesSection
              defaultLocale={tenant.locale}
              contentLocales={tenant.contentLocales}
            />
          </TabsContent>

          <TabsContent value="security">
            <TwoFactorSection twoFactorEnabled={me.twoFactorEnabled === true} />
          </TabsContent>

          <TabsContent value="danger">
            <DangerZoneCard
              tenant={{
                slug: tenant.slug,
                status: tenant.status,
                offboardingScheduledAt: tenant.offboardingScheduledAt,
              }}
              isOwner={isOwner}
              userId={me.userId ?? ''}
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
