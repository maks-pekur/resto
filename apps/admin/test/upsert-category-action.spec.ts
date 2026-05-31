import { describe, expect, it, vi, beforeEach } from 'vitest';

const apiFetchInternalMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock('@/lib/api-server-internal', () => ({
  apiFetchInternal: apiFetchInternalMock,
}));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

const { upsertCategoryAction } =
  await import('../app/dashboard/(workspace)/menu/categories/upsert-category-action');

const buildForm = (over: Record<string, string> = {}): FormData => {
  const fd = new FormData();
  fd.set('name', 'Напитки');
  fd.set('parentId', '');
  fd.set('sortOrder', '0');
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
};

describe('upsertCategoryAction (Plan 04b-05 Task 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns Russian validation error for an empty name (short-circuits before fetch)', async () => {
    const res = await upsertCategoryAction(
      { error: null, success: null },
      buildForm({ name: '   ' }),
    );
    expect(res.error).not.toBeNull();
    expect(apiFetchInternalMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('POSTs to /internal/v1/catalog/categories with LocalizedText name (ru locale)', async () => {
    apiFetchInternalMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { id: 'cat-uuid' },
    });
    const res = await upsertCategoryAction({ error: null, success: null }, buildForm());
    expect(apiFetchInternalMock).toHaveBeenCalledWith('/internal/v1/catalog/categories', {
      method: 'POST',
      body: {
        name: { ru: 'Напитки' },
        parentId: null,
        sortOrder: 0,
      },
    });
    expect(res.error).toBeNull();
    expect(res.success).toEqual({ id: 'cat-uuid' });
  });

  it('includes id in the payload when present (edit mode)', async () => {
    apiFetchInternalMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { id: 'existing-uuid' },
    });
    await upsertCategoryAction({ error: null, success: null }, buildForm({ id: 'existing-uuid' }));
    const calls = apiFetchInternalMock.mock.calls as unknown as [
      string,
      { method?: string; body?: { id?: string; parentId?: string | null } },
    ][];
    expect(calls[0]?.[0]).toBe('/internal/v1/catalog/categories');
    expect(calls[0]?.[1]?.method).toBe('POST');
    expect(calls[0]?.[1]?.body?.id).toBe('existing-uuid');
  });

  it('normalizes a non-empty parentId into the payload', async () => {
    const parentUuid = '11111111-1111-4111-8111-111111111111';
    apiFetchInternalMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { id: 'cat-uuid' },
    });
    await upsertCategoryAction(
      { error: null, success: null },
      buildForm({ name: 'Кофе', parentId: parentUuid }),
    );
    const calls = apiFetchInternalMock.mock.calls as unknown as [
      string,
      { method?: string; body?: { parentId?: string | null } },
    ][];
    expect(calls[0]?.[1]?.body?.parentId).toBe(parentUuid);
  });

  it('revalidates the menu layout segment on success (Pattern S8)', async () => {
    apiFetchInternalMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { id: 'cat-uuid' },
    });
    await upsertCategoryAction({ error: null, success: null }, buildForm());
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard/menu', 'layout');
  });

  it('surfaces 5xx with a generic Russian message', async () => {
    apiFetchInternalMock.mockResolvedValue({
      ok: false,
      status: 500,
      data: { detail: 'internal' },
    });
    const res = await upsertCategoryAction({ error: null, success: null }, buildForm());
    expect(res.error).toMatch(/Серверная ошибка/u);
    expect(res.success).toBeNull();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('surfaces 409 menu_category_slug_taken with the friendly message', async () => {
    apiFetchInternalMock.mockResolvedValue({
      ok: false,
      status: 409,
      data: { code: 'catalog.menu_category_slug_taken' },
    });
    const res = await upsertCategoryAction({ error: null, success: null }, buildForm());
    expect(res.error).toMatch(/уже существует/u);
  });
});
