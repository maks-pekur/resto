import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchInternalMock = vi.fn();

vi.mock('@/lib/api-server-internal', () => ({
  apiFetchInternal: apiFetchInternalMock,
}));

const { photoUploadUrlAction } =
  await import('../app/dashboard/(workspace)/menu/items/[id]/photo-upload-url-action');

describe('photoUploadUrlAction (Plan 04b-07 Task 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs payload { contentType, sizeBytes } and returns uploadUrl + s3Key on success', async () => {
    apiFetchInternalMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { uploadUrl: 'https://s3.example/abc', s3Key: 'tenants/x/items/y.jpg' },
    });
    const res = await photoUploadUrlAction('image/jpeg', 1_024_000);
    expect(apiFetchInternalMock).toHaveBeenCalledWith('/internal/v1/catalog/photo-upload-url', {
      method: 'POST',
      body: { contentType: 'image/jpeg', sizeBytes: 1_024_000 },
    });
    expect(res).toEqual({
      ok: true,
      uploadUrl: 'https://s3.example/abc',
      s3Key: 'tenants/x/items/y.jpg',
    });
  });

  it('rejects disallowed content types client-side without hitting the api', async () => {
    const res = await photoUploadUrlAction('image/gif', 1_000);
    expect(res.ok).toBe(false);
    expect(apiFetchInternalMock).not.toHaveBeenCalled();
  });

  it('rejects oversized payloads client-side (>5 MiB)', async () => {
    const res = await photoUploadUrlAction('image/jpeg', 6 * 1024 * 1024);
    expect(res.ok).toBe(false);
    expect(apiFetchInternalMock).not.toHaveBeenCalled();
  });

  it('accepts JPEG, PNG, and WEBP at the 5 MiB boundary', async () => {
    apiFetchInternalMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { uploadUrl: 'https://s3.example/a', s3Key: 'k' },
    });
    for (const t of ['image/jpeg', 'image/png', 'image/webp']) {
      const r = await photoUploadUrlAction(t, 5 * 1024 * 1024);
      expect(r.ok).toBe(true);
    }
  });

  it('surfaces api errors with a friendly message', async () => {
    apiFetchInternalMock.mockResolvedValue({ ok: false, status: 502, data: null });
    const res = await photoUploadUrlAction('image/jpeg', 1_000);
    expect(res.ok).toBe(false);
  });
});
