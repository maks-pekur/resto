import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FormProvider, useForm } from 'react-hook-form';

const upsertItemSizeActionMock = vi.fn();
const showSuccessMock = vi.fn();
const showErrorMock = vi.fn();

vi.mock('../app/dashboard/(workspace)/menu/items/[id]/upsert-item-size-action', () => ({
  upsertItemSizeAction: upsertItemSizeActionMock,
}));
vi.mock('@/lib/ui/toast-helpers', () => ({
  showSuccess: showSuccessMock,
  showError: showErrorMock,
}));

const { ItemSizesCardClient } =
  await import('../app/dashboard/(workspace)/menu/items/[id]/item-sizes-card-client');

const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const SIZE_ID_M = '22222222-2222-4222-8222-222222222222';
const SIZE_ID_L = '33333333-3333-4333-8333-333333333333';

function WithForm({
  children,
  defaultBasePrice = 4.5,
  defaultCurrency = 'EUR',
}: {
  children: React.ReactNode;
  defaultBasePrice?: number;
  defaultCurrency?: string;
}): React.ReactElement {
  const form = useForm({
    defaultValues: { basePrice: defaultBasePrice, currency: defaultCurrency },
  });
  return <FormProvider {...form}>{children}</FormProvider>;
}

const renderCard = (
  props: React.ComponentProps<typeof ItemSizesCardClient>,
): ReturnType<typeof render> =>
  render(
    <WithForm>
      <ItemSizesCardClient {...props} />
    </WithForm>,
  );

describe('ItemSizesCardClient (Plan 04b-07 Task 5, explicit save)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders an empty-state helper when there are no sizes', () => {
    renderCard({ itemId: ITEM_ID, sizes: [], onSizesChange: () => undefined });
    expect(screen.getByText(/Нет размеров — блюдо использует базовую цену\./u)).toBeInTheDocument();
  });

  it("shows a 'save item first' description and disables both buttons for new items", () => {
    renderCard({ itemId: 'new', sizes: [], onSizesChange: () => undefined });
    expect(
      screen.getByText(/Сначала сохраните блюдо — потом можно добавлять размеры\./u),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Добавить размер' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Сохранить размеры' })).toBeDisabled();
  });

  it('appends a new editable row when "+ Добавить размер" is clicked', () => {
    renderCard({ itemId: ITEM_ID, sizes: [], onSizesChange: () => undefined });
    fireEvent.click(screen.getByRole('button', { name: '+ Добавить размер' }));
    expect(screen.getByPlaceholderText('Название')).toBeInTheDocument();
  });

  it('disables Сохранить размеры until local rows diverge from props', () => {
    renderCard({
      itemId: ITEM_ID,
      sizes: [{ id: SIZE_ID_M, name: { ru: 'Средняя' }, price: '5.00', isDefault: false }],
      onSizesChange: () => undefined,
    });
    expect(screen.getByRole('button', { name: 'Сохранить размеры' })).toBeDisabled();
    fireEvent.change(screen.getByDisplayValue('Средняя'), { target: { value: 'Большая' } });
    expect(screen.getByRole('button', { name: 'Сохранить размеры' })).not.toBeDisabled();
  });

  it('persists rows via per-row upsert on Сохранить размеры and toasts success', async () => {
    upsertItemSizeActionMock.mockResolvedValue({ ok: true, id: SIZE_ID_M });
    renderCard({ itemId: ITEM_ID, sizes: [], onSizesChange: () => undefined });
    fireEvent.click(screen.getByRole('button', { name: '+ Добавить размер' }));
    fireEvent.change(screen.getByPlaceholderText('Название'), { target: { value: 'Средняя' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить размеры' }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(upsertItemSizeActionMock).toHaveBeenCalledWith(
      ITEM_ID,
      expect.objectContaining({ name: 'Средняя' }),
    );
    expect(showSuccessMock).toHaveBeenCalled();
  });

  it('issues DELETE for rows removed locally', async () => {
    upsertItemSizeActionMock.mockResolvedValue({ ok: true });
    renderCard({
      itemId: ITEM_ID,
      sizes: [{ id: SIZE_ID_M, name: { ru: 'Средняя' }, price: '5.00', isDefault: false }],
      onSizesChange: () => undefined,
    });
    fireEvent.click(screen.getByLabelText('Удалить размер'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить размеры' }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(upsertItemSizeActionMock).toHaveBeenCalledWith(
      ITEM_ID,
      expect.objectContaining({ sizeId: SIZE_ID_M }),
      true,
    );
  });

  it('toasts an error when at least one row fails to save', async () => {
    upsertItemSizeActionMock.mockResolvedValue({ ok: false, error: 'boom' });
    renderCard({ itemId: ITEM_ID, sizes: [], onSizesChange: () => undefined });
    fireEvent.click(screen.getByRole('button', { name: '+ Добавить размер' }));
    fireEvent.change(screen.getByPlaceholderText('Название'), { target: { value: 'Большая' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить размеры' }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(showErrorMock).toHaveBeenCalled();
    });
  });

  it('swaps the default radio between rows in local state without firing the api', () => {
    renderCard({
      itemId: ITEM_ID,
      sizes: [
        { id: SIZE_ID_M, name: { ru: 'Средняя' }, price: '5.00', isDefault: true },
        { id: SIZE_ID_L, name: { ru: 'Большая' }, price: '7.00', isDefault: false },
      ],
      onSizesChange: () => undefined,
    });
    const radios = screen.getAllByLabelText('По умолчанию');
    const second = radios[1];
    if (!second) throw new Error('expected second radio');
    fireEvent.click(second);
    expect(upsertItemSizeActionMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Сохранить размеры' })).not.toBeDisabled();
  });

  it('renders the base price input inside the card without triggering the main form save', () => {
    upsertItemSizeActionMock.mockResolvedValue({ ok: true, id: SIZE_ID_M });
    renderCard({ itemId: ITEM_ID, sizes: [], onSizesChange: () => undefined });
    expect(screen.getByLabelText(/Цена$/u)).toBeInTheDocument();
    expect(upsertItemSizeActionMock).not.toHaveBeenCalled();
  });
});
