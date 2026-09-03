import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import {
  fetchMenuPublic,
  fetchAvailabilityPublic,
  TenantNotFoundError,
  TenantSuspendedError,
} from '@/lib/api-client';
import { MenuPageClient } from '@/components/menu/menu-page-client';
import { siteFooterLinks } from '@/components/layout/site-chrome';

async function SuspendedState() {
  const t = await getTranslations('errors');
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <p className="text-muted-foreground text-base">{t('tenantSuspended')}</p>
    </main>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const menu = await fetchMenuPublic();
    const tenantName = menu.tenant?.displayName ?? 'Restaurant';
    const logoUrl = menu.tenant?.theme?.logoUrl ?? undefined;

    return {
      title: `${tenantName} — Menu`,
      description: `Order online from ${tenantName}. Browse our menu and place your order.`,
      robots: { index: true, follow: true },
      openGraph: {
        title: `${tenantName} — Menu`,
        description: `Order online from ${tenantName}. Browse our menu and place your order.`,
        images: logoUrl ? [{ url: logoUrl }] : [],
      },
    };
  } catch {
    return {};
  }
}

export default async function MenuPage() {
  try {
    const [menu, availability, footerLinks] = await Promise.all([
      fetchMenuPublic(),
      fetchAvailabilityPublic().catch(() => ({ stoppedItemIds: [], stoppedIngredientIds: [] })),
      siteFooterLinks(),
    ]);
    return (
      <MenuPageClient
        menu={menu}
        stoppedItemIds={availability.stoppedItemIds}
        stoppedIngredientIds={availability.stoppedIngredientIds}
        footerLinks={footerLinks}
      />
    );
  } catch (err) {
    if (err instanceof TenantNotFoundError) notFound();
    if (err instanceof TenantSuspendedError) return <SuspendedState />;
    throw err;
  }
}
