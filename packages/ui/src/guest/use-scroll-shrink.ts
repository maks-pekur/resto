'use client';

import { useEffect, useRef, useState } from 'react';

/** Below this the page has barely moved, and a bar that flinches at every pixel reads as broken. */
const DIRECTION_THRESHOLD_PX = 12;
const TOP_ZONE_PX = 24;

/**
 * True while the guest is reading downwards: the caller shrinks its chrome to give the page back
 * its room, and restores it the moment they scroll up or reach the top.
 */
export const useScrollShrink = (): boolean => {
  const [compact, setCompact] = useState(false);
  const lastY = useRef(0);
  const frame = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;

    const measure = (): void => {
      frame.current = 0;
      const y = window.scrollY;
      const delta = y - lastY.current;
      if (y <= TOP_ZONE_PX) {
        lastY.current = y;
        setCompact(false);
        return;
      }
      if (Math.abs(delta) < DIRECTION_THRESHOLD_PX) return;
      lastY.current = y;
      setCompact(delta > 0);
    };

    const onScroll = (): void => {
      // Scroll fires far more often than the screen repaints; measuring per frame is enough.
      if (frame.current !== 0) return;
      frame.current = window.requestAnimationFrame(measure);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame.current !== 0) window.cancelAnimationFrame(frame.current);
    };
  }, []);

  return compact;
};
