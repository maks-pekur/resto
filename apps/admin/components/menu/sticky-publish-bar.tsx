import * as React from 'react';
import type { DraftDiffEntry } from '@/lib/menu/types';
import { StickyPublishBarClient } from './sticky-publish-bar-client';

export interface StickyPublishBarProps {
  readonly unpublishedCount: number;
  readonly diffItems: readonly DraftDiffEntry[];
  readonly truncatedCount?: number;
}

export function StickyPublishBar({
  unpublishedCount,
  diffItems,
  truncatedCount,
}: StickyPublishBarProps): React.ReactElement {
  return (
    <StickyPublishBarClient
      unpublishedCount={unpublishedCount}
      diffItems={diffItems}
      {...(truncatedCount !== undefined ? { truncatedCount } : {})}
    />
  );
}
