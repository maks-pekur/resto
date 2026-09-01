import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ExternalLink, QrCode, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SettingsSection } from '@/components/settings/settings-section';
import type { TenantResponse } from '@/lib/queries/tenancy';

interface GuestApp {
  readonly id: 'qr-menu' | 'website';
  readonly icon: typeof QrCode;
  readonly url: string | null;
  readonly settings: readonly {
    readonly setting: 'venue' | 'languages' | 'domains';
    readonly key: string;
  }[];
}

export interface AppsSectionProps {
  readonly tenant: TenantResponse;
}

export function AppsSection({ tenant }: AppsSectionProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'settings.apps' });

  const apps: readonly GuestApp[] = [
    {
      id: 'qr-menu',
      icon: QrCode,
      url: `https://${tenant.slug}.menu.${apex(tenant.primaryDomain)}`,
      settings: [
        { setting: 'venue', key: 'venue' },
        { setting: 'languages', key: 'languages' },
      ],
    },
    {
      id: 'website',
      icon: Globe,
      url: tenant.primaryDomain ? `https://${tenant.primaryDomain}` : null,
      settings: [
        { setting: 'domains', key: 'domains' },
        { setting: 'venue', key: 'venue' },
      ],
    },
  ];

  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <ul className="flex flex-col gap-3">
        {apps.map((app) => (
          <li key={app.id} className="ring-border flex flex-col gap-3 rounded-xl p-4 ring-1">
            <div className="flex items-start gap-3">
              <span className="bg-muted grid size-10 shrink-0 place-items-center rounded-lg">
                <app.icon className="size-5" />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{t(`${app.id}.name`)}</span>
                  <Badge variant="secondary">{t('live')}</Badge>
                </div>
                <p className="text-muted-foreground text-sm">{t(`${app.id}.description`)}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {app.url === null ? null : (
                <Button asChild variant="outline" size="sm">
                  <a href={app.url} target="_blank" rel="noreferrer noopener">
                    <ExternalLink className="size-4" />
                    {t('open')}
                  </a>
                </Button>
              )}
              {app.settings.map((entry) => (
                <Button key={entry.key} asChild variant="ghost" size="sm">
                  <Link to="/settings" search={{ setting: entry.setting }}>
                    {t(`settingsLink.${entry.key}`)}
                  </Link>
                </Button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </SettingsSection>
  );
}

/** `<slug>.menu.<apex>` is the guest host, and the tenant's own domain is the closest thing to
 * the apex the admin knows without another round trip. */
const apex = (primaryDomain: string): string => primaryDomain.split('.').slice(-2).join('.');
