'use client';

import * as React from 'react';
import { formatAge } from '@/lib/menu/format-age';
import type { SaveState } from '@/lib/menu/types';

export interface AutoSaveIndicatorProps {
  readonly state: SaveState;
  readonly now?: number;
}

export function AutoSaveIndicator({
  state,
  now,
}: AutoSaveIndicatorProps): React.ReactElement | null {
  if (state.kind === 'idle') {
    return null;
  }
  if (state.kind === 'saving') {
    return (
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Сохранение…
      </p>
    );
  }
  if (state.kind === 'saved') {
    return (
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Сохранено {formatAge(state.at, now)}
      </p>
    );
  }
  return (
    <p className="text-xs text-destructive" aria-live="polite">
      Не сохранено —{' '}
      <button type="button" className="underline underline-offset-2" onClick={state.retry}>
        повторить
      </button>
    </p>
  );
}
