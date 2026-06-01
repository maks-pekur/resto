import * as React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedAutosave } from '@/lib/menu/use-auto-save';
import type { SaveState } from '@/lib/menu/types';

interface Probe {
  name: string;
}

interface MountedForm {
  setName: (value: string) => void;
  reset: (values: Probe) => void;
  unmount: () => void;
}

const mountForm = (
  onPersist: (values: Probe) => Promise<{ ok: boolean }>,
  onState: (s: SaveState) => void,
): MountedForm => {
  let formApi: ReturnType<typeof useForm<Probe>> | null = null;

  const Inner = (): React.ReactElement => {
    const form = useForm<Probe>({ defaultValues: { name: '' } });
    formApi = form;
    useDebouncedAutosave(form, onPersist, onState);
    return <input data-testid="name" {...form.register('name')} />;
  };

  const { unmount, getByTestId } = render(<Inner />);
  return {
    setName: (value: string) => {
      fireEvent.input(getByTestId('name'), { target: { value } });
    },
    reset: (values: Probe) => {
      formApi?.reset(values);
    },
    unmount,
  };
};

describe('useDebouncedAutosave (Plan 04b-07 Task 1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onPersist exactly once 1500ms after a single field change', async () => {
    const onPersist = vi.fn(async () => ({ ok: true }));
    const onState = vi.fn();
    const form = mountForm(onPersist, onState);

    await act(async () => {
      form.setName('Капучино');
    });

    await act(async () => {
      vi.advanceTimersByTime(1499);
    });
    expect(onPersist).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onPersist).toHaveBeenCalledTimes(1);
  });

  it('debounces two rapid changes into one onPersist call', async () => {
    const onPersist = vi.fn(async () => ({ ok: true }));
    const onState = vi.fn();
    const form = mountForm(onPersist, onState);

    await act(async () => {
      form.setName('Кап');
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    await act(async () => {
      form.setName('Капучино');
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onPersist).toHaveBeenCalledTimes(1);
  });

  it("transitions onState to 'saved' when persist resolves ok", async () => {
    const onPersist = vi.fn(async () => ({ ok: true }));
    const onState = vi.fn();
    const form = mountForm(onPersist, onState);

    await act(async () => {
      form.setName('A');
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'saving' }));
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'saved' }));
  });

  it("transitions onState to 'failed' when persist resolves not-ok", async () => {
    const onPersist = vi.fn(async () => ({ ok: false }));
    const onState = vi.fn();
    const form = mountForm(onPersist, onState);

    await act(async () => {
      form.setName('A');
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
      await Promise.resolve();
    });

    const lastState = onState.mock.calls[onState.mock.calls.length - 1]?.[0] as SaveState;
    expect(lastState.kind).toBe('failed');
  });

  it('discards older save response when a newer save is already in flight (Pitfall #5)', async () => {
    let resolveFirst: (value: { ok: boolean }) => void = () => {};
    let resolveSecond: (value: { ok: boolean }) => void = () => {};
    const onPersist = vi
      .fn<(values: Probe) => Promise<{ ok: boolean }>>()
      .mockImplementationOnce(
        () =>
          new Promise<{ ok: boolean }>((r) => {
            resolveFirst = r;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<{ ok: boolean }>((r) => {
            resolveSecond = r;
          }),
      );
    const onState = vi.fn<(s: SaveState) => void>();
    const form = mountForm(onPersist, onState);

    await act(async () => {
      form.setName('A');
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });
    await act(async () => {
      form.setName('AB');
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });

    onState.mockClear();
    await act(async () => {
      resolveFirst({ ok: false });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onState).not.toHaveBeenCalled();

    await act(async () => {
      resolveSecond({ ok: true });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'saved' }));
  });

  it('cleans up the pending timer on unmount (no stale onPersist fire)', async () => {
    const onPersist = vi.fn(async () => ({ ok: true }));
    const onState = vi.fn();
    const form = mountForm(onPersist, onState);

    await act(async () => {
      form.setName('A');
    });
    form.unmount();
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(onPersist).not.toHaveBeenCalled();
  });

  it('does not fire onPersist on programmatic resets (type !== "change")', async () => {
    const onPersist = vi.fn(async () => ({ ok: true }));
    const onState = vi.fn();
    const form = mountForm(onPersist, onState);

    await act(async () => {
      form.reset({ name: 'X' });
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(onPersist).not.toHaveBeenCalled();
  });
});
