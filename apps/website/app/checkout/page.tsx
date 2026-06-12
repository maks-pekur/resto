import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchMenuPublic, TenantNotFoundError, TenantSuspendedError } from '@/lib/api-client';
import { getTenantSlugFromHeaders } from '@/lib/tenant-resolver';
import { TenantHeader } from '@/components/layout/tenant-header';
import { CheckoutForm } from '@/components/checkout/checkout-form';

export async function generateMetadata(): Promise<Metadata> {
  const slug = await getTenantSlugFromHeaders();
  if (!slug) return {};
  try {
    const menu = await fetchMenuPublic(slug);
    const brandName = menu.brand?.displayName ?? 'Restaurant';
    return { title: `Checkout — ${brandName}`, robots: { index: false } };
  } catch {
    return {};
  }
}

export default async function CheckoutPage() {
  const slug = await getTenantSlugFromHeaders();
  if (!slug) notFound();
  try {
    const menu = await fetchMenuPublic(slug);
    return (
      <>
        <TenantHeader brand={menu.brand} />
        <CheckoutForm />
      </>
    );
  } catch (err) {
    if (err instanceof TenantNotFoundError) notFound();
    if (err instanceof TenantSuspendedError) {
      return (
        <main className="flex min-h-screen items-center justify-center px-4">
          <p className="text-[16px] leading-[1.5] text-[oklch(0.45_0_0)]">
            This restaurant is temporarily unavailable.
          </p>
        </main>
      );
    }
    throw err;
  }
}
