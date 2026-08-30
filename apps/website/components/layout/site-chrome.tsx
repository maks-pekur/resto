import { getLocale, getTranslations } from 'next-intl/server';
import { GuestFooter, GuestHeader, localized, type GuestFooterLink } from '@resto/ui';
import type { MenuTenantDto } from '@resto/api-client/public';
import { LocaleControl } from '@/components/locale-control';
import { ThemeControl } from '@/components/theme-control';

const tenantNameOf = (tenant: MenuTenantDto | null, fallback: string): string =>
  tenant?.displayName ?? fallback;

export async function siteFooterLinks(): Promise<GuestFooterLink[]> {
  const t = await getTranslations('footer');
  return [
    { label: t('about'), href: '/about' },
    { label: t('delivery'), href: '/delivery' },
    { label: t('contact'), href: '/contact' },
    { label: t('faq'), href: '/faq' },
  ];
}

export async function SiteHeader({ tenant }: { tenant: MenuTenantDto | null }) {
  const t = await getTranslations('menu');
  return (
    <GuestHeader
      tenantName={tenantNameOf(tenant, t('title'))}
      logoUrl={tenant?.theme?.logoUrl ?? null}
      actions={
        <>
          <ThemeControl />
          <LocaleControl className="hidden sm:inline-flex" />
        </>
      }
    />
  );
}

export async function SiteFooter({ tenant }: { tenant: MenuTenantDto | null }) {
  const t = await getTranslations('menu');
  const locale = await getLocale();
  return (
    <GuestFooter
      tenantName={tenantNameOf(tenant, t('title'))}
      logoUrl={tenant?.theme?.logoUrl ?? null}
      description={localized(tenant?.description, locale, tenant?.locales.default)}
      socials={tenant?.socials ?? {}}
      contacts={tenant?.contacts ?? {}}
      links={await siteFooterLinks()}
      actions={
        <>
          <LocaleControl />
          <ThemeControl />
        </>
      }
    />
  );
}
