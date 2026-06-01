import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchInternalMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock('@/lib/api-server-internal', () => ({
  apiFetchInternal: apiFetchInternalMock,
}));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

const { resetStopListAction } =
  await import('../app/dashboard/(workspace)/menu/stop-list/reset-stop-list-action');

const ITEM_A = '11111111-1111-4111-8111-111111111111';
const ITEM_B = '22222222-2222-4222-8222-222222222222';
const ITEM_C = '33333333-3333-4333-8333-333333333333';

describe('resetStopListAction (Plan 04b-09 Task 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports zero reset and surfaces error when fetching the stop-list fails', async () => {
    apiFetchInternalMock.mockResolvedValueOnce({ ok: false, status: 500, data: null });
    const res = await resetStopListAction();
    expect(res.ok).toBe(false);
    expect(res.resetCount).toBe(0);
    expect(res.failedIds).toEqual([]);
    expect(res.error).not.toBeNull();
  });

  it('DELETEs every paused item in sequence and revalidates dashboard + menu', async () => {
    apiFetchInternalMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: [{ id: ITEM_A }, { id: ITEM_B }, { id: ITEM_C }],
      })
      .mockResolvedValueOnce({ ok: true, status: 204, data: null })
      .mockResolvedValueOnce({ ok: true, status: 204, data: null })
      .mockResolvedValueOnce({ ok: true, status: 204, data: null });

    const res = await resetStopListAction();

    expect(apiFetchInternalMock).toHaveBeenCalledTimes(4);
    expect(apiFetchInternalMock).toHaveBeenNthCalledWith(
      2,
      `/internal/v1/catalog/stop-list/${ITEM_A}`,
      {
        method: 'DELETE',
      },
    );
    expect(apiFetchInternalMock).toHaveBeenNthCalledWith(
      3,
      `/internal/v1/catalog/stop-list/${ITEM_B}`,
      {
        method: 'DELETE',
      },
    );
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard/menu', 'layout');
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard');
    expect(res).toEqual({ ok: true, resetCount: 3, failedIds: [], error: null });
  });

  it('continues past per-item failures and surfaces failedIds without aborting', async () => {
    apiFetchInternalMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: [{ id: ITEM_A }, { id: ITEM_B }, { id: ITEM_C }],
      })
      .mockResolvedValueOnce({ ok: true, status: 204, data: null })
      .mockResolvedValueOnce({ ok: false, status: 500, data: null })
      .mockResolvedValueOnce({ ok: true, status: 204, data: null });

    const res = await resetStopListAction();

    expect(res.ok).toBe(false);
    expect(res.resetCount).toBe(2);
    expect(res.failedIds).toEqual([ITEM_B]);
    expect(revalidatePathMock).toHaveBeenCalled();
  });

  it('returns ok=true with zero work when the list is empty', async () => {
    apiFetchInternalMock.mockResolvedValueOnce({ ok: true, status: 200, data: [] });
    const res = await resetStopListAction();
    expect(res.ok).toBe(true);
    expect(res.resetCount).toBe(0);
    expect(res.failedIds).toEqual([]);
  });
});
