import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const upsertItemSizeActionMock = vi.fn();

vi.mock('../app/dashboard/(workspace)/menu/items/[id]/upsert-item-size-action', () => ({
  upsertItemSizeAction: upsertItemSizeActionMock,
}));

const { ItemSizesTabClient } =
  await import('../app/dashboard/(workspace)/menu/items/[id]/item-sizes-tab-client');

const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const SIZE_ID_M = '22222222-2222-4222-8222-222222222222';
const SIZE_ID_L = '33333333-3333-4333-8333-333333333333';

describe('ItemSizesTabClient (Plan 04b-07 Task 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders an empty-state helper when there are no sizes', () => {
    render(<ItemSizesTabClient itemId={ITEM_ID} sizes={[]} onSizesChange={() => undefined} />);
    expect(screen.getByText(/Нет размеров — блюдо использует базовую цену\./u)).toBeInTheDocument();
  });

  it("shows a 'save item first' helper and a disabled add button for new items", () => {
    render(<ItemSizesTabClient itemId="new" sizes={[]} onSizesChange={() => undefined} />);
    expect(
      screen.getByText(/Сначала введите название блюда — оно сохранится автоматически\./u),
    ).toBeInTheDocument();
    expect(screen.getByText('+ Добавить размер')).toBeDisabled();
  });

  it('appends a new editable row when "+ Добавить размер" is clicked', () => {
    render(<ItemSizesTabClient itemId={ITEM_ID} sizes={[]} onSizesChange={() => undefined} />);
    fireEvent.click(screen.getByText('+ Добавить размер'));
    expect(screen.getByPlaceholderText('Название')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Цена')).toBeInTheDocument();
  });

  it('persists a row via upsertItemSizeAction on name blur', async () => {
    upsertItemSizeActionMock.mockResolvedValue({ ok: true, id: SIZE_ID_M });
    render(<ItemSizesTabClient itemId={ITEM_ID} sizes={[]} onSizesChange={() => undefined} />);

    fireEvent.click(screen.getByText('+ Добавить размер'));
    const nameInput = screen.getByPlaceholderText('Название');
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Средняя' } });
      fireEvent.blur(nameInput);
      await Promise.resolve();
    });

    expect(upsertItemSizeActionMock).toHaveBeenCalledWith(
      ITEM_ID,
      expect.objectContaining({ name: 'Средняя' }),
    );
  });

  it('removes a draft row immediately without calling the api when it has no sizeId', () => {
    render(<ItemSizesTabClient itemId={ITEM_ID} sizes={[]} onSizesChange={() => undefined} />);
    fireEvent.click(screen.getByText('+ Добавить размер'));
    fireEvent.click(screen.getByLabelText('Удалить размер'));
    expect(screen.queryByPlaceholderText('Название')).not.toBeInTheDocument();
    expect(upsertItemSizeActionMock).not.toHaveBeenCalled();
  });

  it('DELETEs via api when removing an existing-row size', async () => {
    upsertItemSizeActionMock.mockResolvedValue({ ok: true });
    const onSizesChange = vi.fn();
    render(
      <ItemSizesTabClient
        itemId={ITEM_ID}
        sizes={[{ id: SIZE_ID_M, name: { ru: 'Средняя' }, price: '5.00', isDefault: false }]}
        onSizesChange={onSizesChange}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Удалить размер'));
      await Promise.resolve();
    });
    expect(upsertItemSizeActionMock).toHaveBeenCalledWith(
      ITEM_ID,
      expect.objectContaining({ sizeId: SIZE_ID_M }),
      true,
    );
    await waitFor(() => {
      expect(onSizesChange).toHaveBeenCalledWith([]);
    });
  });

  it('fires two upserts when the default radio is moved between rows', async () => {
    upsertItemSizeActionMock.mockResolvedValue({ ok: true });
    render(
      <ItemSizesTabClient
        itemId={ITEM_ID}
        sizes={[
          { id: SIZE_ID_M, name: { ru: 'Средняя' }, price: '5.00', isDefault: true },
          { id: SIZE_ID_L, name: { ru: 'Большая' }, price: '7.00', isDefault: false },
        ]}
        onSizesChange={() => undefined}
      />,
    );

    const radios = screen.getAllByLabelText('По умолчанию');
    expect(radios.length).toBe(2);
    const secondRadio = radios[1];
    if (!secondRadio) throw new Error('expected second radio');
    await act(async () => {
      fireEvent.click(secondRadio);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(upsertItemSizeActionMock).toHaveBeenCalledTimes(2);
  });
});
