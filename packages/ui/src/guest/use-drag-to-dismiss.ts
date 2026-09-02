'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

/** Past a fifth of its own height the sheet is on its way out. */
const DISMISS_RATIO = 0.2;
/** A flick beats the distance rule: px per ms, downwards. */
const FLICK_VELOCITY = 0.5;
/** Past this the pull starts to resist, so the gesture has an end a thumb can feel. */
const RESIST_AFTER = 220;

export interface DragToDismiss {
  readonly ref: RefObject<HTMLDivElement | null>;
  readonly offset: number;
  readonly dragging: boolean;
}

/**
 * A bottom sheet a thumb can throw away. The gesture only arms at the top of the sheet's own
 * scroll, so reading the dish scrolls as usual and one more pull past the photo closes it —
 * the two motions never fight, because only one of them is possible at a time.
 *
 * The listener is attached by hand: React marks touchmove passive, and a passive listener
 * cannot call preventDefault, which is what stops the page rubber-banding under the drag.
 */
export const useDragToDismiss = (open: boolean, onDismiss: () => void): DragToDismiss => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ y: number; at: number; armed: boolean } | null>(null);
  const latest = useRef(0);
  // Held in a ref so a parent re-render cannot re-run the effect below: detaching and re-adding
  // a touchmove listener mid-gesture loses the right to preventDefault, and the drag dies.
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    // Reset on the way in, never on the way out: a sheet released at 200px should slide out from
    // there, not snap back to its place first and leave from the top.
    if (open) {
      setOffset(0);
      setDragging(false);
      latest.current = 0;
    }
  }, [open]);

  useEffect(() => {
    const element = ref.current;
    if (element === null || !open) return;

    const onTouchStart = (event: TouchEvent): void => {
      const touch = event.touches[0];
      if (touch === undefined) return;
      gesture.current = { y: touch.clientY, at: event.timeStamp, armed: element.scrollTop <= 0 };
    };

    const onTouchMove = (event: TouchEvent): void => {
      const current = gesture.current;
      const touch = event.touches[0];
      if (current === null || touch === undefined) return;
      const delta = touch.clientY - current.y;

      if (!current.armed) {
        // The guest scrolled back to the top mid-gesture; arm from here rather than jumping.
        if (element.scrollTop <= 0 && delta > 0) {
          gesture.current = { y: touch.clientY, at: event.timeStamp, armed: true };
        }
        return;
      }
      if (delta <= 0) {
        latest.current = 0;
        setOffset(0);
        setDragging(false);
        return;
      }

      if (event.cancelable) event.preventDefault();
      // Follows the thumb one to one downwards, then gives less and less: the sheet feels
      // attached to the finger without being draggable off the screen.
      const eased = delta > RESIST_AFTER ? RESIST_AFTER + (delta - RESIST_AFTER) * 0.4 : delta;
      latest.current = eased;
      setDragging(true);
      setOffset(eased);
    };

    const onTouchEnd = (event: TouchEvent): void => {
      const current = gesture.current;
      gesture.current = null;
      setDragging(false);
      if (current?.armed !== true) return;

      const travelled = latest.current;
      const elapsed = Math.max(event.timeStamp - current.at, 1);
      const flicked = travelled / elapsed > FLICK_VELOCITY;
      if (travelled > element.getBoundingClientRect().height * DISMISS_RATIO || flicked) {
        dismiss.current();
        return;
      }
      latest.current = 0;
      setOffset(0);
    };

    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: false });
    element.addEventListener('touchend', onTouchEnd, { passive: true });
    element.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [open]);

  return { ref, offset, dragging };
};
