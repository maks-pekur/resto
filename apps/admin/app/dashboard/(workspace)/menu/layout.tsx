import * as React from 'react';
import { apiFetchInternal } from '@/lib/api-server-internal';
import { StickyPublishBar } from '@/components/menu/sticky-publish-bar';
import type { DraftDiff } from '@/lib/menu/types';

export default async function MenuLayout({
  children,
}: {
  readonly children: React.ReactNode;
}): Promise<React.ReactElement> {
  const res = await apiFetchInternal<DraftDiff>('/internal/v1/catalog/draft-diff');
  const unpublishedCount = res.data?.unpublishedCount ?? 0;
  const diffItems = res.data?.items ?? [];
  const truncatedCount = res.data?.truncatedCount;
  return (
    <>
      {children}
      <StickyPublishBar
        unpublishedCount={unpublishedCount}
        diffItems={diffItems}
        {...(truncatedCount !== undefined ? { truncatedCount } : {})}
      />
    </>
  );
}
