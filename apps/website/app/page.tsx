import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  fetchMenuPublic,
  fetchAvailabilityPublic,
  TenantNotFoundError,
  TenantSuspendedError,
} from '@/lib/api-client';
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
    const [menu, availability] = await Promise.all([
      fetchMenuPublic(),
      fetchAvailabilityPublic().catch(() => ({ stoppedItemIds: [] })),
    ]);
    return <MenuPageClient menu={menu} stoppedItemIds={availability.stoppedItemIds} />;
  } catch (err) {
    if (err instanceof TenantNotFoundError) notFound();
    if (err instanceof TenantSuspendedError) return <SuspendedState />;
    throw err;
  }
}
