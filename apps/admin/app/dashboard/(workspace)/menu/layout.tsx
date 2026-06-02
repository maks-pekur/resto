import * as React from 'react';
import { apiFetchInternal } from '@/lib/api-server-internal';
import { StickyPublishBar } from '@/components/menu/sticky-publish-bar';
import { fromLocalizedText, type LocalizedText } from '@/lib/menu/localized';
import type { DraftDiffEntityType, DraftDiffEntry, Status } from '@/lib/menu/types';

interface DraftDiffApiEntry {
  readonly entityType: DraftDiffEntityType;
  readonly id: string;
  readonly name: LocalizedText | string;
  readonly status: Extract<Status, 'draft' | 'modified' | 'archived'>;
}

interface DraftDiffApi {
  readonly unpublishedCount: number;
  readonly truncatedCount: number;
  readonly items: readonly DraftDiffApiEntry[];
}

const normalizeName = (raw: LocalizedText | string): string =>
  typeof raw === 'string' ? raw : fromLocalizedText(raw);

export default async function MenuLayout({
  children,
}: {
  readonly children: React.ReactNode;
}): Promise<React.ReactElement> {
  const res = await apiFetchInternal<DraftDiffApi>('/internal/v1/catalog/draft-diff');
  const unpublishedCount = res.data?.unpublishedCount ?? 0;
  const diffItems: readonly DraftDiffEntry[] = (res.data?.items ?? []).map((entry) => ({
    entityType: entry.entityType,
    id: entry.id,
    name: normalizeName(entry.name),
    status: entry.status,
  }));
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
