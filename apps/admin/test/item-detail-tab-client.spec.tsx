import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const upsertItemActionMock = vi.fn();
const routerReplaceMock = vi.fn();

vi.mock('../app/dashboard/(workspace)/menu/items/[id]/upsert-item-action', () => ({
  upsertItemAction: upsertItemActionMock,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplaceMock, push: vi.fn(), back: vi.fn() }),
}));

vi.mock('../app/dashboard/(workspace)/menu/items/[id]/photo-upload-client', () => ({
  PhotoUploadClient: () => <div data-testid="photo-upload" />,
}));

const { ItemDetailTabClient } =
  await import('../app/dashboard/(workspace)/menu/items/[id]/item-detail-tab-client');

const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '22222222-2222-4222-8222-222222222222';

const defaultProps = {
  initialValues: {
    name: 'Капучино',
    description: 'Кофейный напиток',
    categoryId: CATEGORY_ID,
    basePrice: 4.5,
    currency: 'EUR',
    allergens: ['молоко'],
    proteins: 3.2,
    fats: 4.1,
    carbs: 6.8,
    kcal: 80,
    nutritionEstimated: false,
  },
  categories: [{ id: CATEGORY_ID, name: 'Кофе', parentId: null }],
  currentPhotoS3Key: null,
  currentPhotoUrl: null,
  onPhotoChange: vi.fn(),
  onFirstSave: vi.fn(),
  onSaveState: vi.fn(),
  slug: 'kapuchino',
};

describe('ItemDetailTabClient (Plan 04b-07 Task 3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the form prefilled with initialValues', () => {
    render(<ItemDetailTabClient {...defaultProps} currentItemId={ITEM_ID} />);
    expect(screen.getByDisplayValue('Капучино')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Кофейный напиток')).toBeInTheDocument();
    expect(screen.getByDisplayValue('молоко')).toBeInTheDocument();
    expect(screen.getByText('kapuchino')).toBeInTheDocument();
  });

  it('fires upsertItemAction 1500ms after a name field edit', async () => {
    upsertItemActionMock.mockResolvedValue({ ok: true, id: ITEM_ID });
    render(<ItemDetailTabClient {...defaultProps} currentItemId={ITEM_ID} />);

    const nameInput = screen.getByDisplayValue('Капучино');
    act(() => {
      fireEvent.input(nameInput, { target: { value: 'Латте' } });
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(upsertItemActionMock).toHaveBeenCalledTimes(1);
    expect(upsertItemActionMock.mock.calls[0]?.[0]).toBe(ITEM_ID);
  });

  it('flips URL via router.replace and onFirstSave when a new-item save returns an id', async () => {
    const onFirstSave = vi.fn();
    upsertItemActionMock.mockResolvedValue({ ok: true, id: ITEM_ID });
    render(<ItemDetailTabClient {...defaultProps} currentItemId="new" onFirstSave={onFirstSave} />);

    const nameInput = screen.getByDisplayValue('Капучино');
    act(() => {
      fireEvent.input(nameInput, { target: { value: 'Латте' } });
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onFirstSave).toHaveBeenCalledWith(ITEM_ID);
    expect(routerReplaceMock).toHaveBeenCalledWith(`/dashboard/menu/items/${ITEM_ID}`);
  });
});
