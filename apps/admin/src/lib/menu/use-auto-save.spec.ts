import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseFormReturn } from 'react-hook-form';
import { useDebouncedAutosave, type PersistResult } from './use-auto-save';
import type { SaveState } from './types';

interface TestForm {
  name: string;
}

interface WatchInfo {
  type: string;
}

type WatchCallback = (values: TestForm, info: WatchInfo) => void;

const makeForm = (formValues: TestForm = { name: 'Latte' }) => {
  let capturedWatch: WatchCallback = () => undefined;
  const form = {
    watch: vi.fn((cb: WatchCallback) => {
      capturedWatch = cb;
      return { unsubscribe: vi.fn() };
    }),
    handleSubmit: (fn: (values: TestForm) => Promise<void>) => () => {
      void fn(formValues);
    },
  } as unknown as UseFormReturn<TestForm>;
  return { form, getWatch: () => capturedWatch };
};

const lastState = (spy: ReturnType<typeof vi.fn<(s: SaveState) => void>>): SaveState => {
  const calls = spy.mock.calls;
  const last = calls[calls.length - 1];
  if (!last) throw new Error('onState was never called');
  return last[0];
};

describe('useDebouncedAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('test 1: a change event after debounce calls onPersist; failed result emits failed state with a retry fn', async () => {
    const { form, getWatch } = makeForm();
    const onPersist = vi
      .fn<(values: TestForm) => Promise<PersistResult>>()
      .mockResolvedValue({ ok: false });
    const onState = vi.fn<(s: SaveState) => void>();

    renderHook(() => {
      useDebouncedAutosave(form, onPersist, onState);
    });

    getWatch()({ name: 'Latte' }, { type: 'change' });
    await vi.advanceTimersByTimeAsync(1500);
    await Promise.resolve();

    expect(onPersist).toHaveBeenCalledTimes(1);
    const state = lastState(onState);
    expect(state.kind).toBe('failed');
    expect(typeof (state as Extract<SaveState, { kind: 'failed' }>).retry).toBe('function');
  });

  it('test 2: calling the captured retry invokes onPersist again and emits saving then failed', async () => {
    const { form, getWatch } = makeForm();
    const onPersist = vi
      .fn<(values: TestForm) => Promise<PersistResult>>()
      .mockResolvedValue({ ok: false });
    const onState = vi.fn<(s: SaveState) => void>();

    renderHook(() => {
      useDebouncedAutosave(form, onPersist, onState);
    });

    getWatch()({ name: 'Latte' }, { type: 'change' });
    await vi.advanceTimersByTimeAsync(1500);
    await Promise.resolve();

    expect(onPersist).toHaveBeenCalledTimes(1);

    const failed = lastState(onState);
    expect(failed.kind).toBe('failed');

    onState.mockClear();
    (failed as Extract<SaveState, { kind: 'failed' }>).retry();
    await Promise.resolve();

    expect(onPersist).toHaveBeenCalledTimes(2);
    expect(onState.mock.calls[0]?.[0]?.kind).toBe('saving');
    expect(lastState(onState).kind).toBe('failed');
  });

  it('test 3: retry rebinds to a replaced onPersist (ref-stable WR-02 fix)', async () => {
    const { form, getWatch } = makeForm();
    const persistA = vi
      .fn<(values: TestForm) => Promise<PersistResult>>()
      .mockResolvedValue({ ok: false });
    const persistB = vi
      .fn<(values: TestForm) => Promise<PersistResult>>()
      .mockResolvedValue({ ok: true });
    const onState = vi.fn<(s: SaveState) => void>();

    const { rerender } = renderHook(
      ({ onPersist }) => {
        useDebouncedAutosave(form, onPersist, onState);
      },
      { initialProps: { onPersist: persistA } },
    );

    getWatch()({ name: 'Latte' }, { type: 'change' });
    await vi.advanceTimersByTimeAsync(1500);
    await Promise.resolve();

    const failed = lastState(onState);
    expect(failed.kind).toBe('failed');
    const capturedRetry = (failed as Extract<SaveState, { kind: 'failed' }>).retry;

    rerender({ onPersist: persistB });

    capturedRetry();
    await Promise.resolve();

    expect(persistB).toHaveBeenCalledTimes(1);
    expect(persistA).toHaveBeenCalledTimes(1);
  });
});
