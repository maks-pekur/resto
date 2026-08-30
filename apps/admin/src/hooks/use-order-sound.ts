import * as React from 'react';
import { UNACCEPTED_ESCALATION_MS } from '@/components/orders/order-row';
import type { OrderFeedRowApi } from '@/lib/queries/orders';

const MUTE_STORAGE_KEY = 'orders.soundMuted';
const UNLOCK_STORAGE_KEY = 'orders.soundUnlocked';
const CHIME_URL = '/sounds/order-chime.wav';
const REPEAT_INTERVAL_MS = 30_000;
const CHECK_INTERVAL_MS = 5_000;

export interface UseOrderSoundResult {
  readonly muted: boolean;
  readonly setMuted: (muted: boolean) => void;
  readonly blocked: boolean;
  /** False until the operator's first click has bought playback permission from the browser. */
  readonly unlocked: boolean;
  readonly unlock: () => void;
}

const readStoredMuted = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(MUTE_STORAGE_KEY) === '1';
};

const readStoredUnlocked = (): boolean => {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(UNLOCK_STORAGE_KEY) === '1';
};

export function useOrderSound(unacceptedRows: readonly OrderFeedRowApi[]): UseOrderSoundResult {
  const [muted, setMutedState] = React.useState<boolean>(readStoredMuted);
  const [blocked, setBlocked] = React.useState(false);
  const [unlocked, setUnlocked] = React.useState<boolean>(readStoredUnlocked);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const seenIdsRef = React.useRef<ReadonlySet<string>>(new Set());
  const lastEscalationChimeRef = React.useRef<Map<string, number>>(new Map());
  const mutedRef = React.useRef(muted);
  mutedRef.current = muted;

  const getAudio = React.useCallback((): HTMLAudioElement | null => {
    if (typeof Audio === 'undefined') return null;
    audioRef.current ??= new Audio(CHIME_URL);
    return audioRef.current;
  }, []);

  const play = React.useCallback((): void => {
    const audio = getAudio();
    if (!audio) return;
    audio.currentTime = 0;
    audio
      .play()
      .then(() => {
        setBlocked(false);
      })
      .catch(() => {
        setBlocked(true);
      });
  }, [getAudio]);

  React.useEffect(() => {
    const currentIds = new Set(unacceptedRows.map((row) => row.id));
    let hasNewOrder = false;
    for (const id of currentIds) {
      if (!seenIdsRef.current.has(id)) {
        hasNewOrder = true;
        break;
      }
    }
    seenIdsRef.current = currentIds;
    if (hasNewOrder && !mutedRef.current) {
      play();
    }
  }, [unacceptedRows, play]);

  React.useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      let shouldChime = false;
      for (const row of unacceptedRows) {
        const age = now - new Date(row.createdAt).getTime();
        if (age < UNACCEPTED_ESCALATION_MS) {
          lastEscalationChimeRef.current.delete(row.id);
          continue;
        }
        const lastChime = lastEscalationChimeRef.current.get(row.id) ?? 0;
        if (now - lastChime >= REPEAT_INTERVAL_MS) {
          lastEscalationChimeRef.current.set(row.id, now);
          shouldChime = true;
        }
      }
      if (shouldChime && !mutedRef.current) {
        play();
      }
    }, CHECK_INTERVAL_MS);
    return () => {
      clearInterval(interval);
    };
  }, [unacceptedRows, play]);

  const unlock = React.useCallback((): void => {
    play();
    setUnlocked(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(UNLOCK_STORAGE_KEY, '1');
    }
  }, [play]);

  const setMuted = React.useCallback((next: boolean): void => {
    setMutedState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MUTE_STORAGE_KEY, next ? '1' : '0');
    }
  }, []);

  return { muted, setMuted, blocked, unlocked, unlock };
}
