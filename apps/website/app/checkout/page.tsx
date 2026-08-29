import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchMenuPublic, TenantNotFoundError, TenantSuspendedError } from '@/lib/api-client';
import { getTranslations } from 'next-intl/server';
import { SiteFooter, SiteHeader } from '@/components/layout/site-chrome';
import { CheckoutForm } from '@/components/checkout/checkout-form';

export async function generateMetadata(): Promise<Metadata> {
  try {
    const menu = await fetchMenuPublic();
    const tenantName = menu.tenant?.displayName ?? 'Restaurant';
    return { title: `Checkout — ${tenantName}`, robots: { index: false } };
  } catch {
    return {};
  }
}

export default async function CheckoutPage() {
  try {
    const menu = await fetchMenuPublic();
    return (
      <div className="flex min-h-dvh flex-col">
        <SiteHeader tenant={menu.tenant} />
        <main className="flex-1">
          <CheckoutForm />
        </main>
        <SiteFooter tenant={menu.tenant} />
      </div>
    );
  } catch (err) {
    if (err instanceof TenantNotFoundError) notFound();
    if (err instanceof TenantSuspendedError) {
      return (
        <main className="flex min-h-dvh items-center justify-center px-4">
          <p className="text-muted-foreground text-base">
            {await getTranslations('errors').then((t) => t('tenantSuspended'))}
          </p>
        </main>
      );
    }
    throw err;
  }
}
