'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { Status } from '@/lib/menu/types';

type Variant = 'default' | 'secondary' | 'outline' | 'ghost';

// `paused` is secondary (GM MED-1: must NOT render destructive).
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
  const t = useTranslations('menu.status');
  const label = t(status);
  const extra = EXTRA_CLASS[status];
  return (
    <Badge variant={VARIANTS[status]} className={extra} aria-label={t('ariaLabel', { label })}>
      {label}
    </Badge>
  );
}
