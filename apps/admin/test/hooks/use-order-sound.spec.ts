import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOrderSound } from '@/hooks/use-order-sound';
import type { OrderFeedRowApi } from '@/lib/queries/orders';

const makeRow = (id: string, createdAt: string): OrderFeedRowApi => ({
  id,
  shortNumber: 1,
  status: 'paid',
  locationId: 'loc-1',
  locationName: 'Центр',
  fulfillmentMode: 'dine_in',
  tableIdentifier: null,
  tableZoneName: null,
  tableNumber: null,
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
});
