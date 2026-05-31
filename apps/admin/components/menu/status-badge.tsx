import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import type { Status } from '@/lib/menu/types';

/**
 * Status badge per UI-SPEC §Status badge color semantics + D-09.
 *
 * Variant mapping:
 *   draft     → outline
 *   modified  → outline + amber inline className (warning, not destructive)
 *   published → default
 *   paused    → secondary (GM MED-1: NOT destructive)
 *   archived  → ghost + muted-foreground
 */

const LABELS: Record<Status, string> = {
  draft: 'Черновик',
  modified: 'Изменено',
  published: 'Опубликовано',
  paused: 'Стоп',
  archived: 'Архив',
};

type Variant = 'default' | 'secondary' | 'outline' | 'ghost';

const VARIANTS: Record<Status, Variant> = {
  draft: 'outline',
  modified: 'outline',
  published: 'default',
  paused: 'secondary',
  archived: 'ghost',
};

const EXTRA_CLASS: Partial<Record<Status, string>> = {
  modified: 'border-amber-500 text-amber-700 dark:border-amber-400 dark:text-amber-400',
  archived: 'text-muted-foreground',
};

export interface StatusBadgeProps {
  readonly status: Status;
}

export function StatusBadge({ status }: StatusBadgeProps): React.ReactElement {
  const label = LABELS[status];
  const extra = EXTRA_CLASS[status];
  return (
    <Badge variant={VARIANTS[status]} className={extra} aria-label={`Статус: ${label}`}>
      {label}
    </Badge>
  );
}
