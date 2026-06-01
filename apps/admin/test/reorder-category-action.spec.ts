import { describe, expect, it, vi, beforeEach } from 'vitest';

const apiFetchInternalMock = vi.fn();

vi.mock('@/lib/api-server-internal', () => ({
  apiFetchInternal: apiFetchInternalMock,
}));

const { reorderCategoriesAction } =
  await import('../app/dashboard/(workspace)/menu/categories/reorder-category-action');

const PARENT = '11111111-1111-4111-8111-111111111111';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('reorderCategoriesAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts {parentId, orderedIds} to the batch reorder endpoint', async () => {
    apiFetchInternalMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { updated: 3 },
    });
    const res = await reorderCategoriesAction(
      { error: null, success: false },
      { parentId: PARENT, orderedIds: [B, A, C] },
    );
    expect(res).toEqual({ error: null, success: true });
    expect(apiFetchInternalMock).toHaveBeenCalledTimes(1);
    const call = apiFetchInternalMock.mock.calls[0];
    if (!call) throw new Error('apiFetchInternal was not called');
    expect(call[0]).toBe('/internal/v1/catalog/categories/reorder');
    expect(call[1]).toMatchObject({
      method: 'POST',
      body: { parentId: PARENT, orderedIds: [B, A, C] },
    });
  });

  it('accepts parentId=null for top-level reordering', async () => {
    apiFetchInternalMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { updated: 2 },
    });
    await reorderCategoriesAction(
      { error: null, success: false },
      { parentId: null, orderedIds: [A, B] },
    );
    const call = apiFetchInternalMock.mock.calls[0];
    if (!call) throw new Error('apiFetchInternal was not called');
    expect((call[1] as { body: { parentId: null } }).body.parentId).toBeNull();
  });

  it('short-circuits to success when orderedIds is empty (no network call)', async () => {
    const res = await reorderCategoriesAction(
      { error: null, success: false },
      { parentId: PARENT, orderedIds: [] },
    );
    expect(res).toEqual({ error: null, success: true });
    expect(apiFetchInternalMock).not.toHaveBeenCalled();
  });

  it('surfaces a 5xx as a friendly russian server error', async () => {
    apiFetchInternalMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      data: null,
    });
    const res = await reorderCategoriesAction(
      { error: null, success: false },
      { parentId: PARENT, orderedIds: [A, B] },
    );
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Server error/u);
  });
});
