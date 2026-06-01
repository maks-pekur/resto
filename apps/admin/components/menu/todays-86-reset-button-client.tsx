'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { showError, showSuccess } from '@/lib/ui/toast-helpers';
import { resetStopListAction } from '@/app/dashboard/(workspace)/menu/stop-list/reset-stop-list-action';

export function TodaysWidgetResetButton(): React.ReactElement {
  const [, startTransition] = React.useTransition();
  const [pending, setPending] = React.useState(false);

  const onClick = (): void => {
    if (pending) return;
    setPending(true);
    startTransition(async () => {
      const res = await resetStopListAction();
      setPending(false);
      if (res.ok) {
        showSuccess('Стоп-лист сбросен');
        return;
      }
      if (res.resetCount > 0 && res.failedIds.length > 0) {
        showError(
          `${res.resetCount.toString()} возобновлены, ${res.failedIds.length.toString()} не удалось`,
        );
        return;
      }
      showError(res.error, 'Не удалось сбросить стоп-лист.');
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={pending}
      aria-label="Сбросить весь стоп-лист"
    >
      Сбросить всё
    </Button>
  );
}
