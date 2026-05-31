'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

/**
 * Sonner-custom toast content rendering the 5-second cancellation window
 * for the delayed publish (D-4b-03, UI-SPEC §Delayed-Publish Toast Spec).
 *
 * Implementation note: the elapsed time is computed against a `Date.now()`
 * baseline captured on mount, not by counting ticks — `setInterval(100ms)`
 * is throttled by browsers when the tab is backgrounded, which would
 * desynchronise a tick-counter from wall-clock seconds. `onElapse` is
 * guarded by a ref so it fires exactly once at the 5s boundary.
 *
 * Width is fixed via `w-[360px]` per UI-SPEC.
 */

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
          Публикация через {remainingSec.toString()}с
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Отменить
        </Button>
      </div>
      <Progress value={progress} className="mt-2 h-1" />
    </div>
  );
}
