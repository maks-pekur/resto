import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const upsertItemActionMock = vi.fn();
const routerReplaceMock = vi.fn();
const showSuccessMock = vi.fn();
const showErrorMock = vi.fn();

vi.mock('../app/dashboard/(workspace)/menu/items/[id]/upsert-item-action', () => ({
  upsertItemAction: upsertItemActionMock,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplaceMock, push: vi.fn(), back: vi.fn() }),
}));

vi.mock('../app/dashboard/(workspace)/menu/items/[id]/photo-upload-client', () => ({
  PhotoUploadClient: () => <div data-testid="photo-upload" />,
}));

vi.mock('@/lib/ui/toast-helpers', () => ({
  showSuccess: showSuccessMock,
  showError: showErrorMock,
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
  initialPhotoS3Key: null,
  onPhotoChange: vi.fn(),
  onSaved: vi.fn(),
  slug: 'kapuchino',
};

describe('ItemDetailTabClient (Plan 04b-07 Task 3, explicit save)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the form prefilled with initialValues', () => {
    render(<ItemDetailTabClient {...defaultProps} currentItemId={ITEM_ID} />);
    expect(screen.getByDisplayValue('Капучино')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Кофейный напиток')).toBeInTheDocument();
    expect(screen.getByDisplayValue('молоко')).toBeInTheDocument();
    expect(screen.getByText('kapuchino')).toBeInTheDocument();
  });

  it('shows "Создать блюдо" for new items and "Сохранить" for existing', () => {
    const { rerender } = render(<ItemDetailTabClient {...defaultProps} currentItemId="new" />);
    expect(screen.getByRole('button', { name: 'Создать блюдо' })).toBeInTheDocument();

    rerender(<ItemDetailTabClient {...defaultProps} currentItemId={ITEM_ID} />);
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeInTheDocument();
  });

  it('disables "Сохранить" for existing items until the form is dirty', () => {
    render(<ItemDetailTabClient {...defaultProps} currentItemId={ITEM_ID} />);
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });

  it('enables "Сохранить" once a field changes and calls upsertItemAction on submit', async () => {
    upsertItemActionMock.mockResolvedValue({ ok: true, id: ITEM_ID });
    render(<ItemDetailTabClient {...defaultProps} currentItemId={ITEM_ID} />);

    fireEvent.input(screen.getByDisplayValue('Капучино'), { target: { value: 'Латте' } });
    const saveBtn = screen.getByRole('button', { name: 'Сохранить' });
    await waitFor(() => {
      expect(saveBtn).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(saveBtn);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(upsertItemActionMock).toHaveBeenCalledTimes(1);
    expect(upsertItemActionMock.mock.calls[0]?.[0]).toBe(ITEM_ID);
    expect(showSuccessMock).toHaveBeenCalled();
  });

  it('flips URL via router.replace and calls onSaved when a new-item create succeeds', async () => {
    const onSaved = vi.fn();
    upsertItemActionMock.mockResolvedValue({ ok: true, id: ITEM_ID });
    render(<ItemDetailTabClient {...defaultProps} currentItemId="new" onSaved={onSaved} />);

    const createBtn = screen.getByRole('button', { name: 'Создать блюдо' });
    await act(async () => {
      fireEvent.click(createBtn);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSaved).toHaveBeenCalledWith(ITEM_ID);
    expect(routerReplaceMock).toHaveBeenCalledWith(`/dashboard/menu/items/${ITEM_ID}`);
  });

  it('surfaces a toast and keeps the form dirty when the server rejects the save', async () => {
    upsertItemActionMock.mockResolvedValue({ ok: false, error: 'Ошибка серверa' });
    render(<ItemDetailTabClient {...defaultProps} currentItemId={ITEM_ID} />);
    fireEvent.input(screen.getByDisplayValue('Капучино'), { target: { value: 'Латте' } });
    const saveBtn = screen.getByRole('button', { name: 'Сохранить' });
    await waitFor(() => {
      expect(saveBtn).not.toBeDisabled();
    });
    await act(async () => {
      fireEvent.click(saveBtn);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(showErrorMock).toHaveBeenCalled();
  });
});
