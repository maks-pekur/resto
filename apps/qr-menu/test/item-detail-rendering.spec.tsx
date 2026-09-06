import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type {
  MenuItemDto,
  MenuModifierGroupDto,
  MenuModifierOptionDto,
} from '@resto/api-client/public';
import { GuestUiProvider, ItemDetail } from '@resto/ui';

const item = (over: Partial<MenuItemDto> = {}): MenuItemDto => ({
  id: 'item-1',
  slug: 'margherita',
  categoryId: 'cat-1',
  name: { ru: 'Маргарита' },
  description: null,
  basePrice: '120.00',
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

const option = (over: Partial<MenuModifierOptionDto> = {}): MenuModifierOptionDto => ({
  id: 'o1',
  name: { ru: 'Опция' },
  description: null,
  imageUrl: null,
  priceDelta: '0.00',
  freeAmount: 0,
  ...over,
});

const group = (over: Partial<MenuModifierGroupDto> = {}): MenuModifierGroupDto => ({
  id: 'g1',
  name: { ru: 'Группа' },
  display: 'tiles',
  behaviour: 'several',
  isRequired: false,
  maxSelectable: null,
  optionIds: ['o1'],
  defaultOptionIds: [],
  ...over,
});

const renderDetail = (
  dish: MenuItemDto,
  groups: MenuModifierGroupDto[],
  options: MenuModifierOptionDto[],
  stopped: string[] = [],
) =>
  render(
    <GuestUiProvider
      locale="ru"
      t={(key, values) => (values?.name ? `${key} ${String(values.name)}` : key)}
    >
      <ItemDetail
        item={dish}
        modifierGroups={groups}
        modifierOptions={options}
        stoppedIngredientIds={stopped}
        currency="UAH"
        onAddToCart={vi.fn()}
      />
    </GuestUiProvider>,
  );

describe('ING-11: a guest block renders from the group display and behaviour settings', () => {
  const withPhoto = option({ id: 'o1', name: { ru: 'Бекон' }, imageUrl: 'https://x/bacon.webp' });
  const noPhoto = option({ id: 'o2', name: { ru: 'Халапеньо' } });
  const described = option({
    id: 'o3',
    name: { ru: 'Моцарелла' },
    description: { ru: 'из молока буйволицы' },
    imageUrl: 'https://x/mozz.webp',
  });

  it('renders an image only for the option that has one, and a placeholder for the one that does not', () => {
    const { container } = renderDetail(
      item({ modifierGroupIds: ['g1'] }),
      [group({ optionIds: ['o1', 'o2'] })],
      [withPhoto, noPhoto],
    );

    const bacon = screen.getByLabelText(/Бекон/u).closest('label') as HTMLElement;
    const jalapeno = screen.getByLabelText(/Халапеньо/u).closest('label') as HTMLElement;

    // The photo carries alt="", which is presentational — it has no 'img' role to query.
    expect(bacon.querySelector('img')).not.toBeNull();
    expect(jalapeno.querySelector('img')).toBeNull();
    // The placeholder is an aria-hidden icon, so it has no accessible name to query by;
    // its presence as the only svg inside the photo slot is what distinguishes it.
    expect(jalapeno.querySelector('svg')).not.toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('shows an option description as its own line under the name', () => {
    renderDetail(item({ modifierGroupIds: ['g1'] }), [group({ optionIds: ['o3'] })], [described]);

    expect(screen.getByText('из молока буйволицы')).toBeInTheDocument();
  });

  it('takes single-versus-multiple from behaviour, not from photos or isRequired', () => {
    const { unmount } = renderDetail(
      item({ modifierGroupIds: ['g1'] }),
      // several + required + photos present: still checkboxes
      [group({ behaviour: 'several', isRequired: true, optionIds: ['o1'] })],
      [withPhoto],
    );
    expect(screen.getByLabelText(/Бекон/u)).toHaveAttribute('type', 'checkbox');
    unmount();

    renderDetail(
      item({ modifierGroupIds: ['g1'] }),
      // one + not required + no photo: still a radio
      [group({ behaviour: 'one', isRequired: false, optionIds: ['o2'] })],
      [noPhoto],
    );
    expect(screen.getByLabelText(/Халапеньо/u)).toHaveAttribute('type', 'radio');
  });

  it('renders a tabs group as a single-answer strip that cannot hold two selections', () => {
    const thin = option({ id: 'd1', name: { ru: 'Тонкое' } });
    const thick = option({ id: 'd2', name: { ru: 'Пышное' } });
    renderDetail(
      item({ modifierGroupIds: ['g1'] }),
      [group({ display: 'tabs', behaviour: 'one', isRequired: true, optionIds: ['d1', 'd2'] })],
      [thin, thick],
    );

    const first = screen.getByLabelText(/Тонкое/u);
    const second = screen.getByLabelText(/Пышное/u);
    expect(first).toHaveAttribute('type', 'radio');

    fireEvent.click(first);
    expect(first).toBeChecked();
    fireEvent.click(second);
    expect(second).toBeChecked();
    expect(first).not.toBeChecked();
  });

  it('marks a stopped option unavailable and refuses to select it', () => {
    renderDetail(
      item({ modifierGroupIds: ['g1'] }),
      [group({ optionIds: ['o1'] })],
      [withPhoto],
      ['o1'],
    );

    const bacon = screen.getByLabelText(/Бекон/u);
    // Assert the guarantee, not a click's consequence: jsdom dispatches change on a disabled
    // input where a browser suppresses it, so clicking here would prove nothing either way.
    expect(bacon).toBeDisabled();
    expect(bacon).not.toBeChecked();
    expect(screen.getByText('item.unavailable')).toBeInTheDocument();
  });
});

describe('ING-14: a removable composition line strikes through, a fixed one is plain text', () => {
  const cheese = option({ id: 'c1', name: { ru: 'Сыр' } });
  const basil = option({ id: 'c2', name: { ru: 'Базилик' } });

  const assembled = item({
    compositionMode: 'assembled',
    compositionLines: [
      { optionId: 'c1', removable: false },
      { optionId: 'c2', removable: true },
    ],
  });

  it('renders the removable line as a control and the fixed line as plain text', () => {
    renderDetail(assembled, [], [cheese, basil]);

    // The removable one is operable; the fixed one is not a control at all.
    expect(screen.getByRole('button', { name: /Базилик/u })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Сыр$/u })).toBeNull();
    expect(screen.getByText('Сыр')).toBeInTheDocument();
  });

  it('strikes the line through when tapped and restores it when tapped again', () => {
    renderDetail(assembled, [], [cheese, basil]);

    const line = screen.getByRole('button', { name: /Базилик/u });
    expect(line).toHaveAttribute('aria-pressed', 'false');
    expect(line.className).not.toContain('line-through');

    fireEvent.click(line);
    expect(line).toHaveAttribute('aria-pressed', 'true');
    expect(line.className).toContain('line-through');

    fireEvent.click(line);
    expect(line).toHaveAttribute('aria-pressed', 'false');
    expect(line.className).not.toContain('line-through');
  });

  it('leaves a text-mode composition without any removable control', () => {
    renderDetail(
      item({ compositionMode: 'text', composition: ['Сыр', 'Базилик'] }),
      [],
      [cheese, basil],
    );

    expect(screen.queryByRole('button', { name: /Базилик/u })).toBeNull();
  });
});
