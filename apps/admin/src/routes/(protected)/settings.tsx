import { createRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Globe, Languages, Plug, Store, TriangleAlert } from 'lucide-react';
import { Route as protectedLayoutRoute } from './_layout';
import { hasPermission, requirePermission } from '@/lib/auth/permissions';
import { meQuery } from '@/lib/queries/identity';
import { tenancyQuery } from '@/lib/queries/tenancy';
import { PageHeading } from '@/components/common/page-heading';
import { SettingsNav, type SettingsNavItem } from '@/components/settings/settings-nav';
import { BrandForm } from '@/components/settings/brand-form';
import { ContentLocalesSection } from '@/components/settings/content-locales-section';
import { DomainsSection } from '@/components/settings/domains-section';
import { PaymentsSection } from '@/components/settings/payments-section';
import { DangerZoneCard } from '@/components/settings/danger-zone-card';

const SETTINGS = ['profile', 'languages', 'domains', 'integrations', 'danger'] as const;

const searchSchema = z.object({
  setting: z.enum(SETTINGS).catch('profile'),
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
  const { setting } = Route.useSearch();
  const { data: meResult } = useSuspenseQuery(meQuery());
  const { data: tenantResult } = useSuspenseQuery(tenancyQuery());

  const me = meResult.data;
  const tenant = tenantResult.data;

  if (me?.kind !== 'operator' || !me.tenantId || !tenant) {
    return null;
  }

  const canSeeIntegrations = hasPermission(me, 'billing', 'read');
  const items: SettingsNavItem[] = [
    { value: 'profile', label: t('tabProfile'), icon: Store },
    { value: 'languages', label: t('tabLanguages'), icon: Languages },
    { value: 'domains', label: t('tabDomains'), icon: Globe },
    ...(canSeeIntegrations
      ? [{ value: 'integrations', label: t('tabIntegrations'), icon: Plug }]
      : []),
    { value: 'danger', label: t('tabDanger'), icon: TriangleAlert },
  ];

  const active = setting === 'integrations' && !canSeeIntegrations ? 'profile' : setting;

  return (
    <>
      <PageHeading title={t('pageTitle')} description={t('pageDescription')} />
      <div className="flex flex-1 flex-col gap-6 px-4 md:flex-row lg:px-6">
        <SettingsNav items={items} active={active} ariaLabel={t('navLabel')} />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {active === 'profile' ? <BrandForm tenant={tenant} /> : null}
          {active === 'languages' ? (
            <ContentLocalesSection
              defaultLocale={tenant.locale}
              contentLocales={tenant.contentLocales}
            />
          ) : null}
          {active === 'domains' ? <DomainsSection /> : null}
          {active === 'integrations' ? <PaymentsSection /> : null}
          {active === 'danger' ? (
            <DangerZoneCard
              tenant={{
                slug: tenant.slug,
                status: tenant.status,
                offboardingScheduledAt: tenant.offboardingScheduledAt,
              }}
              isOwner={me.baseRole === 'owner'}
              userId={me.userId ?? ''}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
