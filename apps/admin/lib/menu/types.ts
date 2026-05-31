/**
 * Shared types for the catalog admin UI (Phase 04b).
 *
 * Status union mirrors the backend lifecycle (D-09, GM MED-1: paused is
 * NOT destructive). DraftDiff mirrors the response shape from
 * GET /internal/v1/catalog/draft-diff added in Plan 04b-02 — kept in this
 * package to avoid pulling the heavy generated api-client into client
 * bundles for a 3-field DTO.
 */

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
