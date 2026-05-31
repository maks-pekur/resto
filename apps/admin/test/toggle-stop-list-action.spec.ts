import { describe, expect, it, vi, beforeEach } from 'vitest';

const apiFetchInternalMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock('@/lib/api-server-internal', () => ({
  apiFetchInternal: apiFetchInternalMock,
}));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

const { toggleStopListAction } =
  await import('../app/dashboard/(workspace)/menu/items/toggle-stop-list-action');

const ITEM_ID = '11111111-1111-4111-8111-111111111111';

describe('toggleStopListAction (Plan 04b-06 Task 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POSTs /internal/v1/catalog/stop-list with itemId + null reason when next='paused'", async () => {
    apiFetchInternalMock.mockResolvedValue({
      ok: true,
      status: 201,
      data: null,
    });
    const res = await toggleStopListAction({ itemId: ITEM_ID, next: 'paused' });
    expect(apiFetchInternalMock).toHaveBeenCalledWith('/internal/v1/catalog/stop-list', {
      method: 'POST',
      body: { itemId: ITEM_ID, reason: null },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard/menu', 'layout');
    expect(res).toEqual({ ok: true, error: null });
  });

  it("DELETEs /internal/v1/catalog/stop-list/:itemId when next='published'", async () => {
    apiFetchInternalMock.mockResolvedValue({
      ok: true,
      status: 204,
      data: null,
    });
    const res = await toggleStopListAction({ itemId: ITEM_ID, next: 'published' });
    expect(apiFetchInternalMock).toHaveBeenCalledWith(`/internal/v1/catalog/stop-list/${ITEM_ID}`, {
      method: 'DELETE',
    });
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard/menu', 'layout');
    expect(res).toEqual({ ok: true, error: null });
  });

  it('surfaces 409 catalog.menu_item_not_found as an "Item not found" error', async () => {
    apiFetchInternalMock.mockResolvedValue({
      ok: false,
      status: 409,
      data: { code: 'catalog.menu_item_not_found' },
    });
    const res = await toggleStopListAction({ itemId: ITEM_ID, next: 'paused' });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Item not found.');
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('surfaces 409 catalog.stop_list_item_not_found as a not-on-stop-list error', async () => {
    apiFetchInternalMock.mockResolvedValue({
      ok: false,
      status: 409,
      data: { code: 'catalog.stop_list_item_not_found' },
    });
    const res = await toggleStopListAction({ itemId: ITEM_ID, next: 'published' });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Item is not on the stop list.');
  });

  it('surfaces 5xx with a generic retry message', async () => {
    apiFetchInternalMock.mockResolvedValue({
      ok: false,
      status: 502,
      data: null,
    });
    const res = await toggleStopListAction({ itemId: ITEM_ID, next: 'paused' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Could not update the stop list/u);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
