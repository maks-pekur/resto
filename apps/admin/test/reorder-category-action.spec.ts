import { describe, expect, it, vi, beforeEach } from 'vitest';

const apiFetchMock = vi.fn();

vi.mock('@/lib/api-server', () => ({
  apiFetch: apiFetchMock,
}));

const { reorderCategoriesAction } =
  await import('../app/dashboard/(workspace)/menu/categories/reorder-category-action');

const PARENT = '11111111-1111-4111-8111-111111111111';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('reorderCategoriesAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts {moves} to the batch reorder endpoint', async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { updated: 2 },
    });
    const moves = [
      { id: A, parentId: null, sortOrder: 0 },
      { id: B, parentId: PARENT, sortOrder: 0 },
    ];
    const res = await reorderCategoriesAction({ error: null, success: false }, { moves });
    expect(res).toEqual({ error: null, success: true });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const call = apiFetchMock.mock.calls[0];
    if (!call) throw new Error('apiFetch was not called');
    expect(call[0]).toBe('/v1/catalog/categories/reorder');
    expect(call[1]).toMatchObject({ method: 'POST', body: { moves } });
  });

  it('short-circuits to success when moves is empty (no network call)', async () => {
    const res = await reorderCategoriesAction({ error: null, success: false }, { moves: [] });
    expect(res).toEqual({ error: null, success: true });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('surfaces 5xx as a friendly server error', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: false, status: 500, data: null });
    const res = await reorderCategoriesAction(
      { error: null, success: false },
      { moves: [{ id: A, parentId: null, sortOrder: 0 }] },
    );
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Server error/u);
  });

  it('surfaces 400 with depth code from the nesting guard', async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      data: { code: 'catalog.category_nesting_depth', message: 'depth violation' },
    });
    const res = await reorderCategoriesAction(
      { error: null, success: false },
      { moves: [{ id: A, parentId: B, sortOrder: 0 }] },
    );
    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
  });
});
