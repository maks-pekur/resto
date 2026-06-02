import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchInternalMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock('@/lib/api-server-internal', () => ({
  apiFetchInternal: apiFetchInternalMock,
}));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

const { upsertItemAction } =
  await import('../app/dashboard/(workspace)/menu/items/[id]/upsert-item-action');

const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '22222222-2222-4222-8222-222222222222';

const validValues = {
  name: 'Капучино',
  description: 'Кофейный напиток',
  categoryId: CATEGORY_ID,
  basePrice: 4.5,
  currency: 'EUR',
  allergens: ['молоко'],
  ingredients: [],
  metaTitle: null,
  metaDescription: null,
  proteins: 3.2,
  fats: 4.1,
  carbs: 6.8,
  kcal: 80,
  nutritionEstimated: false,
};

interface CallShape {
  readonly body: Record<string, unknown>;
}

const lastCallBody = (): Record<string, unknown> => {
  const first = apiFetchInternalMock.mock.calls[0] as readonly [string, CallShape] | undefined;
  if (!first) throw new Error('apiFetchInternal was not invoked');
  return first[1].body;
};

describe('upsertItemAction (Plan 04b-07 Task 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ok with new id, revalidates layout + detail on a successful new-item create', async () => {
    apiFetchInternalMock.mockResolvedValue({ ok: true, status: 200, data: { id: ITEM_ID } });
    const res = await upsertItemAction('new', validValues, null);
    expect(apiFetchInternalMock).toHaveBeenCalledWith(
      '/internal/v1/catalog/items',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard/menu', 'layout');
    expect(revalidatePathMock).toHaveBeenCalledWith(`/dashboard/menu/items/${ITEM_ID}`);
    expect(res).toEqual({ ok: true, id: ITEM_ID });
  });

  it('serialises basePrice via toFixed(2) and omits id for new items', async () => {
    apiFetchInternalMock.mockResolvedValue({ ok: true, status: 200, data: { id: ITEM_ID } });
    await upsertItemAction('new', { ...validValues, basePrice: 4.5 }, null);
    const callBody = lastCallBody();
    expect(callBody.basePrice).toBe('4.50');
    expect(callBody.id).toBeUndefined();
  });

  it('sends an empty photos array when no s3Key is provided', async () => {
    apiFetchInternalMock.mockResolvedValue({ ok: true, status: 200, data: { id: ITEM_ID } });
    await upsertItemAction('new', validValues, null);
    const body = lastCallBody();
    expect(body.photos).toEqual([]);
  });

  it('sends a single primary photo entry when s3Key is provided', async () => {
    apiFetchInternalMock.mockResolvedValue({ ok: true, status: 200, data: { id: ITEM_ID } });
    await upsertItemAction('new', validValues, 'tenants/xx/items/yy.jpg');
    const body = lastCallBody();
    expect(body.photos).toEqual([
      { s3Key: 'tenants/xx/items/yy.jpg', sortOrder: 0, isPrimary: true },
    ]);
  });

  it('short-circuits on validation failure without calling the api', async () => {
    const res = await upsertItemAction('new', { ...validValues, name: '   ' }, null);
    expect(res.ok).toBe(false);
    expect(apiFetchInternalMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('surfaces api errors and does not revalidate on failure', async () => {
    apiFetchInternalMock.mockResolvedValue({
      ok: false,
      status: 404,
      data: { code: 'catalog.menu_category_not_found' },
    });
    const res = await upsertItemAction(ITEM_ID, validValues, null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(typeof res.error).toBe('string');
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('sends id for existing items', async () => {
    apiFetchInternalMock.mockResolvedValue({ ok: true, status: 200, data: { id: ITEM_ID } });
    await upsertItemAction(ITEM_ID, validValues, null);
    const body = lastCallBody();
    expect(body.id).toBe(ITEM_ID);
  });

  it('forwards ingredients + metaTitle + metaDescription to apiFetchInternal', async () => {
    apiFetchInternalMock.mockResolvedValue({ ok: true, status: 200, data: { id: ITEM_ID } });
    await upsertItemAction(
      'new',
      {
        ...validValues,
        ingredients: ['pasta', 'egg', 'pancetta'],
        metaTitle: 'Carbonara — Trattoria',
        metaDescription: 'Classic Roman pasta with pancetta and egg yolk.',
      },
      null,
    );
    const body = lastCallBody();
    expect(body.ingredients).toEqual(['pasta', 'egg', 'pancetta']);
    expect(body.metaTitle).toBe('Carbonara — Trattoria');
    expect(body.metaDescription).toBe('Classic Roman pasta with pancetta and egg yolk.');
  });
});
