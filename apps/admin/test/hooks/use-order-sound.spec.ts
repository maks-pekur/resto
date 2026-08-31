import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOrderSound } from '@/hooks/use-order-sound';
import type { OrderFeedRowApi } from '@/lib/queries/orders';

const makeRow = (id: string, createdAt: string): OrderFeedRowApi => ({
  id,
  shortNumber: 1,
  status: 'placed',
  locationId: 'loc-1',
  locationName: 'Центр',
  orderType: 'dine_in',
  tableIdentifier: null,
  tableZoneName: null,
  tableNumber: null,
  customerName: null,
  customerPhone: null,
  paymentType: 'online',
  paymentState: 'paid',
  total: '1200.00',
  currency: 'RUB',
  itemCount: 1,
  channel: 'site',
  createdAt,
  acceptedAt: null,
  preparingAt: null,
  readyAt: null,
  completedAt: null,
  canceledAt: null,
  etaAt: null,
  cancelReason: null,
  canceledFromStatus: null,
  hasFailedRefund: false,
});

describe('useOrderSound', () => {
  let playMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.localStorage.clear();
    playMock = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.play = playMock;
    window.HTMLMediaElement.prototype.pause = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a newly appearing unaccepted order id triggers exactly one play()', async () => {
    const row = makeRow('order-1', new Date().toISOString());
    const { rerender } = renderHook(({ rows }) => useOrderSound(rows), {
      initialProps: { rows: [] as readonly OrderFeedRowApi[] },
    });

    rerender({ rows: [row] });
    await act(async () => {
      await Promise.resolve();
    });

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it('the same id on a subsequent poll triggers none', async () => {
    const row = makeRow('order-1', new Date().toISOString());
    const { rerender } = renderHook(({ rows }) => useOrderSound(rows), {
      initialProps: { rows: [] as readonly OrderFeedRowApi[] },
    });

    rerender({ rows: [row] });
    await act(async () => {
      await Promise.resolve();
    });
    expect(playMock).toHaveBeenCalledTimes(1);

    rerender({ rows: [{ ...row }] });
    await act(async () => {
      await Promise.resolve();
    });

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it('a rejected play() promise sets the blocked state without throwing', async () => {
    playMock.mockRejectedValue(new Error('NotAllowedError'));
    const row = makeRow('order-1', new Date().toISOString());
    const { result, rerender } = renderHook(({ rows }) => useOrderSound(rows), {
      initialProps: { rows: [] as readonly OrderFeedRowApi[] },
    });

    rerender({ rows: [row] });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.blocked).toBe(true);
  });

  it('muting suppresses play() entirely', async () => {
    const row = makeRow('order-1', new Date().toISOString());
    const { result, rerender } = renderHook(({ rows }) => useOrderSound(rows), {
      initialProps: { rows: [] as readonly OrderFeedRowApi[] },
    });

    act(() => {
      result.current.setMuted(true);
    });

    rerender({ rows: [row] });
    await act(async () => {
      await Promise.resolve();
    });

    expect(playMock).not.toHaveBeenCalled();
  });

  it('starts locked until the operator has bought playback permission', () => {
    const { result } = renderHook(() => useOrderSound([]));

    expect(result.current.unlocked).toBe(false);
  });

  it('unlock plays once, remembers the permission and reports itself unlocked', () => {
    const { result } = renderHook(() => useOrderSound([]));

    act(() => {
      result.current.unlock();
    });

    expect(playMock).toHaveBeenCalledTimes(1);
    expect(result.current.unlocked).toBe(true);
    expect(window.localStorage.getItem('orders.soundUnlocked')).toBe('1');
  });

  it('starts unlocked on the next visit', () => {
    window.localStorage.setItem('orders.soundUnlocked', '1');

    const { result } = renderHook(() => useOrderSound([]));

    expect(result.current.unlocked).toBe(true);
  });
});
