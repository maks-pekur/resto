import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchMenuPublic, TenantNotFoundError, TenantSuspendedError } from '@/lib/api-client';
import { TenantHeader } from '@/components/layout/tenant-header';
import { ContentPage } from '@/components/content-page';
import { getSeededContent, type ContentPageKey } from '@/lib/content';

export async function contentMetadata(label: string): Promise<Metadata> {
  try {
    const menu = await fetchMenuPublic();
    const brandName = menu.brand?.displayName ?? 'Restaurant';
    return { title: `${label} — ${brandName}`, robots: { index: true, follow: true } };
  } catch {
    return {};
  }
}

export async function ContentRouteServer({ pageKey }: { pageKey: ContentPageKey }) {
  try {
    const menu = await fetchMenuPublic();
    const brandName = menu.brand?.displayName ?? 'Restaurant';
    const { heading, body } = getSeededContent(pageKey, brandName);
    return (
      <>
        <TenantHeader brand={menu.brand} />
        <ContentPage heading={heading} body={body} />
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
