'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { resetStopListAction } from '@/app/dashboard/(workspace)/menu/stop-list/reset-stop-list-action';

export function TodaysWidgetResetButton(): React.ReactElement {
  const t = useTranslations('menu.stopList');
  const [, startTransition] = React.useTransition();
  const [pending, setPending] = React.useState(false);

  const onClick = (): void => {
    if (pending) return;
    setPending(true);
    startTransition(async () => {
      const res = await resetStopListAction();
      setPending(false);
      if (res.ok) {
        showSuccess(t('resetSuccess'));
        return;
      }
      if (res.resetCount > 0 && res.failedIds.length > 0) {
        showError(t('resetPartial', { ok: res.resetCount, failed: res.failedIds.length }));
        return;
      }
      showError(res.error, t('resetFailed'));
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={pending}
      aria-label={t('resetAllAriaLabel')}
    >
      {t('resetAllBtn')}
    </Button>
  );
}
