import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchInternalMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock('@/lib/api-server-internal', () => ({
  apiFetchInternal: apiFetchInternalMock,
}));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

const { upsertItemModifierGroupsAction } =
  await import('../app/dashboard/(workspace)/menu/items/[id]/upsert-item-modifier-groups-action');

const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const CATEGORY_ID = '22222222-2222-4222-8222-222222222222';
const GROUP_A = '33333333-3333-4333-8333-333333333333';
const GROUP_B = '44444444-4444-4444-8444-444444444444';

const itemDetail = {
  id: ITEM_ID,
  name: { ru: 'Капучино' },
  description: null,
  categoryId: CATEGORY_ID,
  basePrice: '4.50',
  currency: 'EUR',
  allergens: ['молоко'],
  proteins: 3.2,
  fats: 4.1,
  carbs: 6.8,
  kcal: 80,
  nutritionEstimated: false,
  source: 'manual',
  photos: [],
  slug: 'kapuchino',
  status: 'draft',
  sizes: [],
  modifierGroupIds: [GROUP_A],
};

interface CallShape {
  readonly body: Record<string, unknown>;
}

const upsertBody = (): Record<string, unknown> => {
  const second = apiFetchInternalMock.mock.calls[1] as readonly [string, CallShape] | undefined;
  if (!second) throw new Error('upsert call was not invoked');
  return second[1].body;
};

describe('upsertItemModifierGroupsAction (Plan 04b-08 Task 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GETs the item then POSTs the full item body with replaced modifierGroupIds', async () => {
    apiFetchInternalMock
      .mockResolvedValueOnce({ ok: true, status: 200, data: itemDetail })
      .mockResolvedValueOnce({ ok: true, status: 200, data: { id: ITEM_ID } });

    const res = await upsertItemModifierGroupsAction(ITEM_ID, [GROUP_B]);

    expect(apiFetchInternalMock).toHaveBeenNthCalledWith(
      1,
      `/internal/v1/catalog/items/${ITEM_ID}`,
    );
    expect(apiFetchInternalMock).toHaveBeenNthCalledWith(
      2,
      '/internal/v1/catalog/items',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(upsertBody().modifierGroupIds).toEqual([GROUP_B]);
    expect(upsertBody().id).toBe(ITEM_ID);
    expect(upsertBody().categoryId).toBe(CATEGORY_ID);
    expect(res).toEqual({ ok: true });
  });

  it('revalidates layout + detail path on success', async () => {
    apiFetchInternalMock
      .mockResolvedValueOnce({ ok: true, status: 200, data: itemDetail })
      .mockResolvedValueOnce({ ok: true, status: 200, data: { id: ITEM_ID } });

    await upsertItemModifierGroupsAction(ITEM_ID, []);
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard/menu', 'layout');
    expect(revalidatePathMock).toHaveBeenCalledWith(`/dashboard/menu/items/${ITEM_ID}`);
  });

  it('short-circuits when the item fetch fails', async () => {
    apiFetchInternalMock.mockResolvedValueOnce({ ok: false, status: 404, data: null });
    const res = await upsertItemModifierGroupsAction(ITEM_ID, [GROUP_B]);
    expect(res.ok).toBe(false);
    expect(apiFetchInternalMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces upsert errors and skips revalidate', async () => {
    apiFetchInternalMock
      .mockResolvedValueOnce({ ok: true, status: 200, data: itemDetail })
      .mockResolvedValueOnce({ ok: false, status: 500, data: null });
    const res = await upsertItemModifierGroupsAction(ITEM_ID, []);
    expect(res.ok).toBe(false);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
