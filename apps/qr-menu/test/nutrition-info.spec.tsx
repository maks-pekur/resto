import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { MenuItemDto } from '@resto/api-client/public';
import { GuestUiProvider, NutritionInfo, hasNutrition } from '@resto/ui';

const dish = (over: Partial<MenuItemDto> = {}): MenuItemDto => ({
  id: 'item-1',
  slug: 'shrimp',
  categoryId: 'cat-1',
  name: { ru: 'Креветки' },
  description: null,
  basePrice: '239.00',
  currency: 'UAH',
  weight: null,
  measureUnit: null,
  imageUrl: null,
  photos: [],
  allergens: [],
  diets: [],
  proteins: '9.1',
  fats: '7.5',
  carbs: '32.9',
  kcal: 236,
  sortOrder: 0,
  sizes: [],
  modifierGroupIds: [],
  extraOptionIds: [],
  compositionMode: 'text',
  composition: [],
  compositionLines: [],
  ...over,
});

const renderInfo = (item: MenuItemDto) =>
  render(
    <GuestUiProvider locale="ru" t={(key) => key}>
      <NutritionInfo item={item} />
    </GuestUiProvider>,
  );

describe('NutritionInfo', () => {
  it('is offered only for a dish someone filled the figures in for', () => {
    expect(hasNutrition(dish())).toBe(true);
    expect(hasNutrition(dish({ proteins: null, fats: null, carbs: null, kcal: null }))).toBe(false);
  });

  it('renders nothing at all without figures', () => {
    const { container } = renderInfo(dish({ proteins: null, fats: null, carbs: null, kcal: null }));

    expect(container).toBeEmptyDOMElement();
  });

  it('keeps the figures behind a tap', () => {
    renderInfo(dish());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'item.nutritionOpen' }));

    const panel = screen.getByRole('dialog');
    expect(panel).toHaveTextContent('236');
    expect(panel).toHaveTextContent('9,1');
  });

  it('lists only the figures a dish actually has', () => {
    renderInfo(dish({ fats: null, carbs: null }));
    fireEvent.click(screen.getByRole('button', { name: 'item.nutritionOpen' }));

    const panel = screen.getByRole('dialog');
    expect(panel).toHaveTextContent('item.protein');
    expect(panel).not.toHaveTextContent('item.fat');
  });
});
