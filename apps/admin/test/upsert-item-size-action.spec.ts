import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock('@/lib/api-server', () => ({
  apiFetch: apiFetchMock,
}));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

const { upsertItemSizeAction } =
  await import('../app/dashboard/(workspace)/menu/items/[id]/upsert-item-size-action');

const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const SIZE_ID = '22222222-2222-4222-8222-222222222222';

interface CallShape {
  readonly body: Record<string, unknown>;
}

const lastCallBody = (): Record<string, unknown> => {
  const first = apiFetchMock.mock.calls[0] as readonly [string, CallShape] | undefined;
  if (!first) throw new Error('apiFetch was not invoked');
  return first[1].body;
};

describe('upsertItemSizeAction (Plan 04b-07 Task 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs with toLocalizedText name and toFixed(2) price; revalidates layout + detail', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, status: 200, data: { id: SIZE_ID } });
    await upsertItemSizeAction(ITEM_ID, { name: 'Средняя', price: 5, isDefault: false });
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/v1/catalog/item-sizes',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = lastCallBody();
    expect(body.name).toEqual({ ru: 'Средняя' });
    expect(body.price).toBe('5.00');
    expect(body.itemId).toBe(ITEM_ID);
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard/menu', 'layout');
    expect(revalidatePathMock).toHaveBeenCalledWith(`/dashboard/menu/items/${ITEM_ID}`);
  });

  it('attaches sizeId as id when updating an existing row', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, status: 200, data: { id: SIZE_ID } });
    await upsertItemSizeAction(ITEM_ID, {
      sizeId: SIZE_ID,
      name: 'Большая',
      price: 6,
      isDefault: true,
    });
    const body = lastCallBody();
    expect(body.id).toBe(SIZE_ID);
  });

  it('DELETEs the correct path when isDelete=true and sizeId is present', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, status: 204, data: null });
    await upsertItemSizeAction(
      ITEM_ID,
      { sizeId: SIZE_ID, name: '', price: 0, isDefault: false },
      true,
    );
    expect(apiFetchMock).toHaveBeenCalledWith(`/v1/catalog/item-sizes/${SIZE_ID}`, {
      method: 'DELETE',
    });
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard/menu', 'layout');
  });

  it('rejects delete without sizeId', async () => {
    const res = await upsertItemSizeAction(ITEM_ID, { name: '', price: 0, isDefault: false }, true);
    expect(res.ok).toBe(false);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('short-circuits on schema validation failure (empty name)', async () => {
    const res = await upsertItemSizeAction(ITEM_ID, { name: '   ', price: 5, isDefault: false });
    expect(res.ok).toBe(false);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('surfaces api errors and does not revalidate on failure', async () => {
    apiFetchMock.mockResolvedValue({ ok: false, status: 500, data: null });
    const res = await upsertItemSizeAction(ITEM_ID, { name: 'A', price: 1, isDefault: false });
    expect(res.ok).toBe(false);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
