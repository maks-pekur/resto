import { createRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Route as protectedLayoutRoute } from './_layout';
import { meQuery } from '@/lib/queries/identity';
import { PageHeading } from '@/components/common/page-heading';
import { SettingsSection } from '@/components/settings/settings-section';
import { TwoFactorSection } from '@/components/settings/two-factor-section';

export const Route = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/account',
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(meQuery()),
  component: AccountPage,
});

function AccountPage() {
  const { t } = useTranslation('translation', { keyPrefix: 'account' });
  const { data: meResult } = useSuspenseQuery(meQuery());
  const me = meResult.data;

  if (me?.kind !== 'operator') return null;

  return (
    <>
      <PageHeading title={t('pageTitle')} description={t('pageDescription')} />
      <div className="flex flex-1 flex-col gap-6 px-4 lg:px-6">
        <SettingsSection title={t('identityTitle')} description={t('identityDescription')}>
          <dl className="grid gap-3 sm:max-w-md">
            <div className="flex items-center justify-between gap-4 text-sm">
              <dt className="text-muted-foreground">{t('emailLabel')}</dt>
              <dd className="truncate font-medium">{me.email}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <dt className="text-muted-foreground">{t('roleLabel')}</dt>
              <dd className="font-medium">{me.baseRole ?? '—'}</dd>
            </div>
          </dl>
        </SettingsSection>

        <TwoFactorSection twoFactorEnabled={me.twoFactorEnabled === true} />
      </div>
    </>
  );
}
