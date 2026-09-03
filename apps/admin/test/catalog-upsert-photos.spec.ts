import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ItemEditorForm } from '@/lib/menu/zod-schemas';

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(() => Promise.resolve({ ok: true })),
}));
vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));

const { upsertItem } = await import('@/lib/queries/catalog');

const FORM = {
  name: 'Cola 0.5 l',
  description: null,
  categoryId: 'aea186f2-be9e-418f-951f-4c6c9d60425e',
  basePrice: 45,
  currency: 'UAH',
  allergens: [],
  modifiers: [],
  metaTitle: null,
  metaDescription: null,
  proteins: null,
  fats: null,
  carbs: null,
  kcal: null,
} as unknown as ItemEditorForm;

const bodyOf = (): Record<string, unknown> => {
  const call = apiFetchMock.mock.calls[0] as unknown as [string, { body: Record<string, unknown> }];
  return call[1].body;
};

describe('upsertItem sends photos in the contract shape', () => {
  beforeEach(() => {
    apiFetchMock.mockClear();
  });

  // The api declares `photos` with `.default([])` and the repository writes it on both
  // the insert and the update path. Omitting it does not preserve the item's photo —
  // it erases it. The editor used to send a `photoS3Key` field the api never reads.
  it('carries the current photo through as a photos entry', async () => {
    await upsertItem('item-1', { ...FORM, photoS3Key: 'tenant/x/menu-items/a.webp' });
    expect(bodyOf().photos).toEqual([{ s3Key: 'tenant/x/menu-items/a.webp', sortOrder: 0 }]);
  });

  it('never sends the photoS3Key field the api does not accept', async () => {
    await upsertItem('item-1', { ...FORM, photoS3Key: 'tenant/x/menu-items/a.webp' });
    expect(bodyOf()).not.toHaveProperty('photoS3Key');
  });

  it('sends an empty photos array when the item genuinely has none', async () => {
    await upsertItem('item-1', { ...FORM, photoS3Key: null });
    expect(bodyOf().photos).toEqual([]);
  });
});
