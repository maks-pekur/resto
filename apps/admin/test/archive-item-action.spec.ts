import { describe, expect, it, vi, beforeEach } from 'vitest';

const apiFetchInternalMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock('@/lib/api-server-internal', () => ({
  apiFetchInternal: apiFetchInternalMock,
}));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

const { archiveItemAction } =
  await import('../app/dashboard/(workspace)/menu/items/archive-item-action');

const ITEM_ID = '11111111-1111-4111-8111-111111111111';

describe('archiveItemAction (Plan 04b-06 Task 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('PATCHes /internal/v1/catalog/items/:id/archive and revalidates on success', async () => {
    apiFetchInternalMock.mockResolvedValue({
      ok: true,
      status: 204,
      data: null,
    });
    const res = await archiveItemAction({ error: null, success: false }, { id: ITEM_ID });
    expect(apiFetchInternalMock).toHaveBeenCalledWith(
      `/internal/v1/catalog/items/${ITEM_ID}/archive`,
      { method: 'PATCH' },
    );
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard/menu', 'layout');
    expect(res).toEqual({ error: null, success: true });
  });

  it('surfaces 404 as the Russian "Блюдо не найдено" message', async () => {
    apiFetchInternalMock.mockResolvedValue({
      ok: false,
      status: 404,
      data: { code: 'catalog.menu_item_not_found' },
    });
    const res = await archiveItemAction({ error: null, success: false }, { id: ITEM_ID });
    expect(res.error).toBe('Блюдо не найдено.');
    expect(res.success).toBe(false);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('surfaces 5xx with a generic Russian message', async () => {
    apiFetchInternalMock.mockResolvedValue({
      ok: false,
      status: 502,
      data: null,
    });
    const res = await archiveItemAction({ error: null, success: false }, { id: ITEM_ID });
    expect(res.error).toMatch(/Серверная ошибка/u);
    expect(res.success).toBe(false);
  });
});
