import * as React from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('translation', { keyPrefix: 'common' });
  if (state.kind === 'idle') {
    return null;
  }
  if (state.kind === 'saving') {
    return (
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {t('savingAria')}
      </p>
    );
  }
  if (state.kind === 'saved') {
    return (
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {t('savedAt', { age: formatAge(state.at, now) })}
      </p>
    );
  }
  return (
    <p className="text-xs text-destructive" aria-live="polite">
      {t('notSavedRetry')} —{' '}
      <button type="button" className="underline underline-offset-2" onClick={state.retry}>
        {t('retryLink')}
      </button>
    </p>
  );
}
