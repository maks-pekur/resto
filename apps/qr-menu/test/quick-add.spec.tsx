import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type {
  MenuItemDto,
  MenuModifierGroupDto,
  MenuModifierOptionDto,
} from '@resto/api-client/public';
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
  diets: [],
  proteins: null,
  fats: null,
  carbs: null,
  kcal: null,
  sortOrder: 0,
  sizes: [],
  modifierGroupIds: [],
  extraOptionIds: [],
  compositionMode: 'text',
  composition: [],
  compositionLines: [],
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
  it('will not let a required question go unanswered', async () => {
    const { ItemDetail } = await import('@resto/ui');
    const sauce: MenuModifierGroupDto = {
      id: 'g2',
      name: { ru: 'Соус' },
      display: 'tabs',
      behaviour: 'one',
      isRequired: true,
      optionIds: ['o3'],
    };
    const sauceOptions: MenuModifierOptionDto[] = [
      {
        id: 'o3',
        name: { ru: 'Кетчуп' },
        description: null,
        imageUrl: null,
        priceDelta: '0.00',
        freeAmount: 0,
      },
    ];

    render(
      <GuestUiProvider locale="ru" t={(key) => key}>
        <ItemDetail
          item={item({ modifierGroupIds: ['g2'] })}
          modifierGroups={[sauce]}
          modifierOptions={sauceOptions}
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

describe('the tap that adds', () => {
  it('answers on the button, then goes back to showing the price', () => {
    vi.useFakeTimers();
    try {
      renderCard(item());
      fireEvent.click(priceButton());

      // The cart lives a tab away, so the button itself has to say the tap landed.
      expect(priceButton().textContent).toContain('item.added');

      act(() => {
        vi.advanceTimersByTime(1_500);
      });

      expect(priceButton().textContent).not.toContain('item.added');
    } finally {
      vi.useRealTimers();
    }
  });
});
