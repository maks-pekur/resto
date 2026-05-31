import * as React from 'react';
import type { DraftDiffEntry } from '@/lib/menu/types';
import { StickyPublishBarClient } from './sticky-publish-bar-client';

/**
 * RSC wrapper for the sticky publish bar. Owns no behaviour — it forwards
 * the draft-diff snapshot supplied by the route-group layout to the client
 * island. Keeping this thin RSC pass-through lets the layout fetch the
 * draft-diff inside the React Server Components boundary (where the
 * `INTERNAL_API_TOKEN` is safe) while the interactive island holds the
 * Sonner / countdown lifecycle on the client.
 */

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
