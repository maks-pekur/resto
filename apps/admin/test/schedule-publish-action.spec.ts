import { describe, expect, it, vi, beforeEach } from 'vitest';

const apiFetchInternalMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock('@/lib/api-server-internal', () => ({ apiFetchInternal: apiFetchInternalMock }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

const { schedulePublishAction } = await import('../lib/menu/schedule-publish-action');

describe('schedulePublishAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs /internal/v1/catalog/publish and returns ok=true with scheduledAt on 2xx', async () => {
    apiFetchInternalMock.mockResolvedValue({
      ok: true,
      status: 202,
      data: { scheduled: true, cancelAfterMs: 5_000 },
    });
    const before = Date.now();
    const res = await schedulePublishAction();
    expect(apiFetchInternalMock).toHaveBeenCalledWith('/internal/v1/catalog/publish', {
      method: 'POST',
    });
    expect(res.ok).toBe(true);
    expect(res.error).toBeNull();
    if (res.ok) {
      expect(res.scheduledAt).toBeGreaterThanOrEqual(before);
    }
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard/menu', 'layout');
  });

  it('returns ok=false with Russian error copy on 5xx, no revalidation', async () => {
    apiFetchInternalMock.mockResolvedValue({ ok: false, status: 500, data: null });
    const res = await schedulePublishAction();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.scheduledAt).toBeNull();
      expect(res.error).toBe('Не удалось опубликовать — проверьте соединение');
    }
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('returns ok=false on network-level failure (status: 0)', async () => {
    apiFetchInternalMock.mockResolvedValue({ ok: false, status: 0, data: null });
    const res = await schedulePublishAction();
    expect(res.ok).toBe(false);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
