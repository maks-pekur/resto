import { describe, expect, it, vi, beforeEach } from 'vitest';

const apiFetchMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock('@/lib/api-server', () => ({ apiFetch: apiFetchMock }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

const { cancelPublishAction } = await import('../lib/menu/cancel-publish-action');

describe('cancelPublishAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('DELETEs /v1/catalog/publish; cancelled=true → expired=false, revalidates', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, status: 200, data: { cancelled: true } });
    const res = await cancelPublishAction();
    expect(apiFetchMock).toHaveBeenCalledWith('/v1/catalog/publish', {
      method: 'DELETE',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.cancelled).toBe(true);
      expect(res.expired).toBe(false);
    }
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard/menu', 'layout');
  });

  it('cancelled=false → expired=true (publish window already elapsed), revalidates', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, status: 200, data: { cancelled: false } });
    const res = await cancelPublishAction();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.cancelled).toBe(false);
      expect(res.expired).toBe(true);
    }
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard/menu', 'layout');
  });

  it('returns ok=false with Russian error copy on 5xx, no revalidation', async () => {
    apiFetchMock.mockResolvedValue({ ok: false, status: 500, data: null });
    const res = await cancelPublishAction();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('Could not cancel publication — please try again.');
    }
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('returns ok=false on network-level failure (status: 0)', async () => {
    apiFetchMock.mockResolvedValue({ ok: false, status: 0, data: null });
    const res = await cancelPublishAction();
    expect(res.ok).toBe(false);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
