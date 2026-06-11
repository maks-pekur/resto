'use client';

// Auto-save via RHF watch+debounce (RESEARCH.md Pattern 1, community-canonical for RHF).
// requestId guard prevents older saves overwriting newer indicator state (RESEARCH.md Pitfall #5).

import { useEffect, useRef } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import type { SaveState } from './types';

const DEBOUNCE_MS = 1500;

export interface PersistResult {
  readonly ok: boolean;
}

export const useDebouncedAutosave = <TForm extends FieldValues>(
  form: UseFormReturn<TForm>,
  onPersist: (values: TForm) => Promise<PersistResult>,
  onState: (next: SaveState) => void,
): void => {
  const requestIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPersistRef = useRef(onPersist);
  const onStateRef = useRef(onState);

  useEffect(() => {
    onPersistRef.current = onPersist;
    onStateRef.current = onState;
  }, [onPersist, onState]);

  useEffect(() => {
    const runSave = (): void => {
      const myReqId = ++requestIdRef.current;
      onStateRef.current({ kind: 'saving' });
      void form.handleSubmit(async (values) => {
        let res: PersistResult;
        try {
          res = await onPersistRef.current(values);
        } catch {
          res = { ok: false };
        }
        if (myReqId !== requestIdRef.current) return;
        if (res.ok) {
          onStateRef.current({ kind: 'saved', at: Date.now() });
          return;
        }
        onStateRef.current({ kind: 'failed', retry: runSave });
      })();
    };

    const subscription = form.watch((_values, { type }) => {
      if (type !== 'change') return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(runSave, DEBOUNCE_MS);
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      subscription.unsubscribe();
    };
  }, [form]);
};
