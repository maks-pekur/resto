import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchMenuPublic, TenantNotFoundError, TenantSuspendedError } from '@/lib/api-client';
import { getTenantSlugFromHeaders } from '@/lib/tenant-resolver';
import { MenuPageClient } from '@/components/menu/menu-page-client';

function SuspendedState() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <p className="text-[16px] leading-[1.5] text-[oklch(0.45_0_0)]">
        This restaurant is temporarily unavailable.
      </p>
    </main>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const slug = await getTenantSlugFromHeaders();
  if (!slug) return {};

  try {
    const menu = await fetchMenuPublic(slug);
    const brandName = menu.brand?.displayName ?? 'Restaurant';
    const logoUrl = menu.brand?.theme?.logoUrl ?? undefined;

    return {
      title: `${brandName} — Menu`,
      description: `Order online from ${brandName}. Browse our menu and place your order.`,
      robots: { index: true, follow: true },
      openGraph: {
        title: `${brandName} — Menu`,
        description: `Order online from ${brandName}. Browse our menu and place your order.`,
        images: logoUrl ? [{ url: logoUrl }] : [],
      },
    };
  } catch {
    return {};
  }
}

export default async function MenuPage() {
  const slug = await getTenantSlugFromHeaders();
  if (!slug) notFound();

  try {
    const menu = await fetchMenuPublic(slug);
    return <MenuPageClient menu={menu} />;
  } catch (err) {
    if (err instanceof TenantNotFoundError) notFound();
    if (err instanceof TenantSuspendedError) return <SuspendedState />;
    throw err;
  }
}
