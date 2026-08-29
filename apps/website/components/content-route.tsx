import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchMenuPublic, TenantNotFoundError, TenantSuspendedError } from '@/lib/api-client';
import { SiteFooter, SiteHeader } from '@/components/layout/site-chrome';
import { ContentPage } from '@/components/content-page';
import { getSeededContent, type ContentPageKey } from '@/lib/content';
import { getTranslations } from 'next-intl/server';

const suspendedMessage = async (): Promise<string> => {
  const t = await getTranslations('errors');
  return t('tenantSuspended');
};

export async function contentMetadata(label: string): Promise<Metadata> {
  try {
    const menu = await fetchMenuPublic();
    const tenantName = menu.tenant?.displayName ?? 'Restaurant';
    return { title: `${label} — ${tenantName}`, robots: { index: true, follow: true } };
  } catch {
    return {};
  }
}

export async function ContentRouteServer({ pageKey }: { pageKey: ContentPageKey }) {
  try {
    const menu = await fetchMenuPublic();
    const tenantName = menu.tenant?.displayName ?? 'Restaurant';
    const { heading, body } = getSeededContent(pageKey, tenantName);
    return (
      <div className="flex min-h-dvh flex-col">
        <SiteHeader tenant={menu.tenant} />
        <main className="flex-1">
          <ContentPage heading={heading} body={body} />
        </main>
        <SiteFooter tenant={menu.tenant} />
      </div>
    );
  } catch (err) {
    if (err instanceof TenantNotFoundError) notFound();
    if (err instanceof TenantSuspendedError) {
      return (
        <main className="flex min-h-dvh items-center justify-center px-4">
          <p className="text-muted-foreground text-base">{await suspendedMessage()}</p>
        </main>
      );
    }
    throw err;
  }
}
