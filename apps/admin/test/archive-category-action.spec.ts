import { describe, expect, it, vi, beforeEach } from 'vitest';

const apiFetchMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock('@/lib/api-server', () => ({
  apiFetch: apiFetchMock,
}));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

const { archiveCategoryAction } =
  await import('../app/dashboard/(workspace)/menu/categories/archive-category-action');

const CAT_ID = '11111111-1111-4111-8111-111111111111';

describe('archiveCategoryAction (Plan 04b-05 Task 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('PATCHes /v1/catalog/categories/:id/archive and revalidates on success', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      data: null,
    });
    const res = await archiveCategoryAction({ error: null, success: false }, { id: CAT_ID });
    expect(apiFetchMock).toHaveBeenCalledWith(`/v1/catalog/categories/${CAT_ID}/archive`, {
      method: 'PATCH',
    });
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard/menu', 'layout');
    expect(res).toEqual({ error: null, success: true });
  });

  it('surfaces 404 as "Category not found."', async () => {
    apiFetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      data: { code: 'catalog.menu_category_not_found' },
    });
    const res = await archiveCategoryAction({ error: null, success: false }, { id: CAT_ID });
    expect(res.error).toBe('Category not found.');
    expect(res.success).toBe(false);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('surfaces 5xx with a generic retry message', async () => {
    apiFetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      data: null,
    });
    const res = await archiveCategoryAction({ error: null, success: false }, { id: CAT_ID });
    expect(res.error).toMatch(/Server error/u);
    expect(res.success).toBe(false);
  });
});
