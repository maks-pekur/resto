'use client';

import * as React from 'react';
import { formatAge } from '@/lib/menu/format-age';
import type { SaveState } from '@/lib/menu/types';

/**
 * Auto-save status indicator (D-4b-02, UI-SPEC §Auto-Save Indicator Spec).
 *
 * Visual states:
 *   idle    → null (no chrome when nothing to report)
 *   saving  → muted "Сохранение…"
 *   saved   → muted "Сохранено Xс назад" (relative via formatAge)
 *   failed  → destructive "Не сохранено — повторить" (retry link)
 *
 * `aria-live="polite"` ensures screen readers announce state transitions
 * without interrupting the operator's typing flow.
 */

export interface AutoSaveIndicatorProps {
  readonly state: SaveState;
  /**
   * Injectable wall clock for deterministic tests. Defaults to Date.now().
   */
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
