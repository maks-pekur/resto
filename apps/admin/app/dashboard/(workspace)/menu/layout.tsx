import * as React from 'react';
import { apiFetchInternal } from '@/lib/api-server-internal';
import { StickyPublishBar } from '@/components/menu/sticky-publish-bar';
import type { DraftDiff } from '@/lib/menu/types';

/**
 * Route-group layout for `/dashboard/menu/*` (Plan 04b-04, Wave 3).
 *
 * Fetches the draft-diff snapshot inside the RSC boundary — keeping
 * `INTERNAL_API_TOKEN` server-only (apps/CLAUDE.md) — and forwards it
 * to the sticky bar client island. The bar is hidden when
 * `unpublishedCount === 0` (handled by the client island itself).
 *
 * The sticky bar is mounted ONLY at this layout segment, not the outer
 * dashboard layout, so it appears only when the operator is inside the
 * Menu section (UI-SPEC §Sticky Publish Bar Spec).
 */
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
