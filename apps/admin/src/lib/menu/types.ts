export type Status = 'draft' | 'modified' | 'published' | 'paused' | 'archived';

export type SaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved'; readonly at: number }
  | { readonly kind: 'failed'; readonly retry: () => void };

export type DraftDiffEntityType = 'item' | 'category' | 'modifier-group';

export interface DraftDiffEntry {
  readonly entityType: DraftDiffEntityType;
  readonly id: string;
  readonly name: string;
  readonly status: 'draft' | 'modified' | 'archived';
}

export interface DraftDiff {
  readonly unpublishedCount: number;
  readonly truncatedCount: number;
  readonly items: readonly DraftDiffEntry[];
}
