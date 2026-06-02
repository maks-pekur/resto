'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

// Elapsed is computed off a Date.now() baseline (not tick-count) because
// setInterval is throttled when the tab backgrounds and would desync from wall-clock.
const COUNTDOWN_MS = 5_000;
const TICK_MS = 100;

export interface PublishCountdownToastProps {
  readonly onCancel: () => void;
  readonly onElapse: () => void;
}

export function PublishCountdownToast({
  onCancel,
  onElapse,
}: PublishCountdownToastProps): React.ReactElement {
  const t = useTranslations('menu.publishBar');
  const [elapsed, setElapsed] = React.useState(0);
  const elapsedFiredRef = React.useRef(false);
  const onElapseRef = React.useRef(onElapse);
  onElapseRef.current = onElapse;

  React.useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const next = Date.now() - start;
      setElapsed(next);
      if (next >= COUNTDOWN_MS && !elapsedFiredRef.current) {
        elapsedFiredRef.current = true;
        clearInterval(id);
        onElapseRef.current();
      }
    }, TICK_MS);
    return () => {
      clearInterval(id);
    };
  }, []);

  const remainingSec = Math.max(0, Math.ceil((COUNTDOWN_MS - elapsed) / 1_000));
  const progress = Math.min(100, (elapsed / COUNTDOWN_MS) * 100);

  return (
    <div className="w-[360px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm" aria-live="polite">
          {t('countdownLabel', { sec: remainingSec })}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t('cancelBtn')}
        </Button>
      </div>
      <Progress value={progress} className="mt-2 h-1" />
    </div>
  );
}
