import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { MenuItemDto } from '@resto/api-client/public';
import { GuestUiProvider, MenuItemCard } from '@resto/ui';

const item = (over: Partial<MenuItemDto> = {}): MenuItemDto => ({
  id: 'item-1',
  slug: 'cola',
  categoryId: 'cat-1',
  name: { ru: 'Кола' },
  description: null,
  basePrice: '45.00',
  currency: 'UAH',
  weight: null,
  measureUnit: null,
  imageUrl: null,
  photos: [],
  allergens: [],
  proteins: null,
  fats: null,
  carbs: null,
  kcal: null,
  sortOrder: 0,
  sizes: [],
  modifierGroupIds: [],
  ...over,
});

const renderCard = (dish: MenuItemDto) => {
  const onSelect = vi.fn();
  const onQuickAdd = vi.fn();
  render(
    <GuestUiProvider locale="ru" t={(key, values) => `${key}:${JSON.stringify(values ?? {})}`}>
      <MenuItemCard item={dish} onSelect={onSelect} onQuickAdd={onQuickAdd} />
    </GuestUiProvider>,
  );
  return { onSelect, onQuickAdd };
};

const priceButton = (): HTMLElement => {
  const buttons = screen.getAllByRole('button');
  const last = buttons[buttons.length - 1];
  if (last === undefined) throw new Error('no price button');
  return last;
};

describe('MenuItemCard price button', () => {
  it('puts a dish with nothing to choose straight in the cart', () => {
    const { onQuickAdd, onSelect } = renderCard(item());

    fireEvent.click(priceButton());

    expect(onQuickAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'item-1' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('opens a dish that still has a size to pick', () => {
    const { onQuickAdd, onSelect } = renderCard(
      item({
        sizes: [
          { id: 's1', name: { ru: 'S' }, price: '60.00', isDefault: true, sortOrder: 0 },
          { id: 's2', name: { ru: 'L' }, price: '40.00', isDefault: false, sortOrder: 1 },
        ],
      }),
    );

    fireEvent.click(priceButton());

    expect(onSelect).toHaveBeenCalledWith('item-1');
    expect(onQuickAdd).not.toHaveBeenCalled();
  });

  it('quotes the cheapest size, not the base price', () => {
    renderCard(
      item({
        basePrice: '99.00',
        sizes: [
          { id: 's1', name: { ru: 'S' }, price: '60.00', isDefault: true, sortOrder: 0 },
          { id: 's2', name: { ru: 'L' }, price: '40.00', isDefault: false, sortOrder: 1 },
        ],
      }),
    );

    expect(priceButton().textContent).toContain('40');
  });

  it('opens a dish whose modifiers still need answering', () => {
    const { onSelect } = renderCard(item({ modifierGroupIds: ['group-1'] }));

    fireEvent.click(priceButton());

    expect(onSelect).toHaveBeenCalledWith('item-1');
  });
});

describe('ItemDetail choices', () => {
  it('opens with the option the kitchen would use anyway', async () => {
    const { ItemDetail } = await import('@resto/ui');
    const dough = {
      id: 'g1',
      name: { ru: 'Тесто' },
      minSelectable: 1,
      maxSelectable: 1,
      isRequired: true,
      options: [
        {
          id: 'o1',
          name: { ru: 'Традиционное' },
          priceDelta: '0.00',
          defaultAmount: 1,
          freeAmount: 0,
          sortOrder: 0,
        },
        {
          id: 'o2',
          name: { ru: 'Тонкое' },
          priceDelta: '0.00',
          defaultAmount: 0,
          freeAmount: 0,
          sortOrder: 1,
        },
      ],
    } as never;

    render(
      <GuestUiProvider locale="ru" t={(key) => key}>
        <ItemDetail
          item={item({ modifierGroupIds: ['g1'] })}
          modifierGroups={[dough]}
          currency="UAH"
          onAddToCart={vi.fn()}
        />
      </GuestUiProvider>,
    );

    expect(screen.getByRole('radio', { name: 'Традиционное' })).toBeChecked();
    expect(screen.getByRole('button', { name: /item.addToCart/u })).toBeEnabled();
  });

  it('will not let a required question go unanswered', async () => {
    const { ItemDetail } = await import('@resto/ui');
    const sauce = {
      id: 'g2',
      name: { ru: 'Соус' },
      minSelectable: 1,
      maxSelectable: 1,
      isRequired: true,
      options: [
        {
          id: 'o3',
          name: { ru: 'Кетчуп' },
          priceDelta: '0.00',
          defaultAmount: 0,
          freeAmount: 0,
          sortOrder: 0,
        },
      ],
    } as never;

    render(
      <GuestUiProvider locale="ru" t={(key) => key}>
        <ItemDetail
          item={item({ modifierGroupIds: ['g2'] })}
          modifierGroups={[sauce]}
          currency="UAH"
          onAddToCart={vi.fn()}
        />
      </GuestUiProvider>,
    );

    expect(screen.getByRole('button', { name: /item.addToCart/u })).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: 'Кетчуп' }));

    expect(screen.getByRole('button', { name: /item.addToCart/u })).toBeEnabled();
  });
});
