import { describe, expect, it, vi, beforeEach } from 'vitest';

const apiFetchInternalMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock('@/lib/api-server-internal', () => ({
  apiFetchInternal: apiFetchInternalMock,
}));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

const { archiveCategoryAction } =
  await import('../app/dashboard/(workspace)/menu/categories/archive-category-action');

const CAT_ID = '11111111-1111-4111-8111-111111111111';

describe('archiveCategoryAction (Plan 04b-05 Task 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('PATCHes /internal/v1/catalog/categories/:id/archive and revalidates on success', async () => {
    apiFetchInternalMock.mockResolvedValue({
      ok: true,
      status: 204,
      data: null,
    });
    const res = await archiveCategoryAction({ error: null, success: false }, { id: CAT_ID });
    expect(apiFetchInternalMock).toHaveBeenCalledWith(
      `/internal/v1/catalog/categories/${CAT_ID}/archive`,
      { method: 'PATCH' },
    );
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard/menu', 'layout');
    expect(res).toEqual({ error: null, success: true });
  });

  it('surfaces 404 as the Russian "Категория не найдена" message', async () => {
    apiFetchInternalMock.mockResolvedValue({
      ok: false,
      status: 404,
      data: { code: 'catalog.menu_category_not_found' },
    });
    const res = await archiveCategoryAction({ error: null, success: false }, { id: CAT_ID });
    expect(res.error).toBe('Категория не найдена.');
    expect(res.success).toBe(false);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('surfaces 5xx with a generic Russian message', async () => {
    apiFetchInternalMock.mockResolvedValue({
      ok: false,
      status: 502,
      data: null,
    });
    const res = await archiveCategoryAction({ error: null, success: false }, { id: CAT_ID });
    expect(res.error).toMatch(/Серверная ошибка/u);
    expect(res.success).toBe(false);
  });
});
