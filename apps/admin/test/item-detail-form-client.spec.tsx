import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemEditorForm } from '@/lib/menu/zod-schemas';

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

vi.mock('../app/dashboard/(workspace)/menu/items/[id]/item-sizes-card-client', () => ({
  ItemSizesCardClient: () => <div data-testid="sizes-card" />,
}));

vi.mock('../app/dashboard/(workspace)/menu/items/[id]/item-modifier-groups-card-client', () => ({
  ItemModifierGroupsCardClient: () => <div data-testid="modifier-groups-card" />,
}));

vi.mock('@/lib/ui/toast-helpers', () => ({
  showSuccess: showSuccessMock,
  showError: showErrorMock,
}));

const { ItemDetailFormClient } =
  await import('../app/dashboard/(workspace)/menu/items/[id]/item-detail-form-client');

const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '22222222-2222-4222-8222-222222222222';
const FORM_ID = 'item-form';

const defaultProps = {
  initialValues: {
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
  },
  categories: [{ id: CATEGORY_ID, name: 'Кофе', parentId: null }],
  currentItemId: ITEM_ID,
  initialItemSizes: [],
  onSizesChange: vi.fn(),
  availableModifierGroups: [],
  initialModifierGroupIds: [],
  onSaved: vi.fn(),
  slug: 'kapuchino',
  formId: FORM_ID,
  onStateChange: vi.fn(),
  initialPhotoS3Key: null as string | null,
  currentPhotoS3Key: null as string | null,
};

const submitForm = (): void => {
  const form = document.getElementById(FORM_ID) as HTMLFormElement | null;
  if (!form) throw new Error(`form#${FORM_ID} not in document`);
  fireEvent.submit(form);
};

describe('ItemDetailFormClient (Plan 04b-07 Task 3, explicit save)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the form prefilled with initialValues', () => {
    render(<ItemDetailFormClient {...defaultProps} />);
    expect(screen.getByDisplayValue('Капучино')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Кофейный напиток')).toBeInTheDocument();
    expect(screen.getByDisplayValue('молоко')).toBeInTheDocument();
    expect(screen.getByText('kapuchino')).toBeInTheDocument();
  });

  it('reports form state via onStateChange (isNew, isDirty, isPending)', async () => {
    const onStateChange = vi.fn();
    render(<ItemDetailFormClient {...defaultProps} onStateChange={onStateChange} />);
    await waitFor(() => {
      expect(onStateChange).toHaveBeenLastCalledWith({
        isNew: false,
        isDirty: false,
        isPending: false,
      });
    });
    fireEvent.input(screen.getByDisplayValue('Капучино'), { target: { value: 'Латте' } });
    await waitFor(() => {
      expect(onStateChange).toHaveBeenLastCalledWith({
        isNew: false,
        isDirty: true,
        isPending: false,
      });
    });
  });

  it('reports isNew=true for currentItemId="new"', async () => {
    const onStateChange = vi.fn();
    render(
      <ItemDetailFormClient {...defaultProps} onStateChange={onStateChange} currentItemId="new" />,
    );
    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ isNew: true, isPending: false }),
      );
    });
  });

  it('calls upsertItemAction when the form is submitted externally via form id', async () => {
    upsertItemActionMock.mockResolvedValue({ ok: true, id: ITEM_ID });
    render(<ItemDetailFormClient {...defaultProps} />);

    fireEvent.input(screen.getByDisplayValue('Капучино'), { target: { value: 'Латте' } });
    await act(async () => {
      submitForm();
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
    render(<ItemDetailFormClient {...defaultProps} currentItemId="new" onSaved={onSaved} />);

    await act(async () => {
      submitForm();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSaved).toHaveBeenCalledWith(ITEM_ID);
    expect(routerReplaceMock).toHaveBeenCalledWith(`/dashboard/menu/items/${ITEM_ID}`);
  });

  it('surfaces a toast when the server rejects the save', async () => {
    upsertItemActionMock.mockResolvedValue({ ok: false, error: 'Ошибка серверa' });
    render(<ItemDetailFormClient {...defaultProps} />);
    fireEvent.input(screen.getByDisplayValue('Капучино'), { target: { value: 'Латте' } });
    await act(async () => {
      submitForm();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(showErrorMock).toHaveBeenCalled();
  });

  it('round-trips ingredients into upsertItemAction', async () => {
    upsertItemActionMock.mockResolvedValue({ ok: true, id: ITEM_ID });
    render(
      <ItemDetailFormClient
        {...defaultProps}
        initialValues={{ ...defaultProps.initialValues, ingredients: ['курица', 'томат'] }}
      />,
    );
    await act(async () => {
      submitForm();
      await Promise.resolve();
      await Promise.resolve();
    });
    const ingredientsValues = upsertItemActionMock.mock.calls[0]?.[1] as ItemEditorForm | undefined;
    expect(ingredientsValues?.ingredients).toEqual(['курица', 'томат']);
  });

  it('round-trips metaTitle and metaDescription into upsertItemAction', async () => {
    upsertItemActionMock.mockResolvedValue({ ok: true, id: ITEM_ID });
    render(
      <ItemDetailFormClient
        {...defaultProps}
        initialValues={{
          ...defaultProps.initialValues,
          metaTitle: 'Капучино — Кофейня',
          metaDescription: 'Кофе с молоком, классика.',
        }}
      />,
    );
    await act(async () => {
      submitForm();
      await Promise.resolve();
      await Promise.resolve();
    });
    const seoValues = upsertItemActionMock.mock.calls[0]?.[1] as ItemEditorForm | undefined;
    expect(seoValues?.metaTitle).toBe('Капучино — Кофейня');
    expect(seoValues?.metaDescription).toBe('Кофе с молоком, классика.');
  });

  it('renders the SEO card with metaTitle and metaDescription inputs', () => {
    render(<ItemDetailFormClient {...defaultProps} />);
    expect(screen.getByLabelText(/Meta title/u)).toBeInTheDocument();
    expect(screen.getByLabelText(/Meta description/u)).toBeInTheDocument();
  });
});
