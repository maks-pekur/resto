import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as React from 'react';

const upsertMock = vi.fn();

vi.mock('@/app/dashboard/(workspace)/menu/categories/upsert-category-action', () => ({
  upsertCategoryAction: upsertMock,
}));

vi.mock('@/components/menu/category-select', () => ({
  CategorySelect: ({
    onChange,
    value,
  }: {
    value: string | null;
    onChange: (v: string | null) => void;
  }) => (
    <div data-testid="category-select" data-value={value ?? ''}>
      <button
        type="button"
        data-testid="select-none"
        onClick={() => {
          onChange(null);
        }}
      >
        none
      </button>
      <button
        type="button"
        data-testid="select-parent-a"
        onClick={() => {
          onChange('11111111-1111-4111-8111-111111111111');
        }}
      >
        parent-a
      </button>
    </div>
  ),
}));

const { CategoryFormClient } =
  await import('@/app/dashboard/(workspace)/menu/categories/category-form-client');

const PARENT_A = '11111111-1111-4111-8111-111111111111';
const CHILD_A1 = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const allCategories = [
  {
    id: PARENT_A,
    parentId: null,
    slug: 'napitki',
    name: { ru: 'Напитки' },
    description: null,
    sortOrder: 0,
    status: 'published' as const,
  },
  {
    id: CHILD_A1,
    parentId: PARENT_A,
    slug: 'cofe',
    name: { ru: 'Кофе' },
    description: null,
    sortOrder: 0,
    status: 'published' as const,
  },
];

describe('CategoryFormClient (Plan 04b-05 Task 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertMock.mockResolvedValue({ error: null, success: { id: 'new-id' } });
  });

  it('renders all required form labels in Russian (D-05)', () => {
    render(<CategoryFormClient mode="create" allCategories={allCategories} onClose={vi.fn()} />);
    expect(screen.getByLabelText('Название')).toBeInTheDocument();
    expect(screen.getByText('Родительская категория')).toBeInTheDocument();
    expect(screen.getByLabelText('Порядок сортировки')).toBeInTheDocument();
  });

  it('prefills the form when mode="edit" with the LocalizedText ru value', () => {
    const category = allCategories[1];
    if (!category) throw new Error('fixture');
    render(
      <CategoryFormClient
        mode="edit"
        category={category}
        allCategories={allCategories}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('Кофе')).toBeInTheDocument();
  });

  it('the submit button label changes between create / edit modes', () => {
    const { rerender } = render(
      <CategoryFormClient mode="create" allCategories={allCategories} onClose={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Создать' })).toBeInTheDocument();
    const category = allCategories[0];
    if (!category) throw new Error('fixture');
    rerender(
      <CategoryFormClient
        mode="edit"
        category={category}
        allCategories={allCategories}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeInTheDocument();
  });

  it('renders a Cancel button that calls onClose', () => {
    const onClose = vi.fn();
    render(<CategoryFormClient mode="create" allCategories={allCategories} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('updates hidden parentId input when the CategorySelect fires onChange', () => {
    const { container } = render(
      <CategoryFormClient mode="create" allCategories={allCategories} onClose={vi.fn()} />,
    );
    const hidden = container.querySelector<HTMLInputElement>(
      'input[type="hidden"][name="parentId"]',
    );
    expect(hidden).not.toBeNull();
    expect(hidden?.value).toBe('');
    fireEvent.click(screen.getByTestId('select-parent-a'));
    expect(hidden?.value).toBe(PARENT_A);
    fireEvent.click(screen.getByTestId('select-none'));
    expect(hidden?.value).toBe('');
  });

  it('omits the current category from the parent-picker options (edit mode)', () => {
    const category = allCategories[0];
    if (!category) throw new Error('fixture');
    render(
      <CategoryFormClient
        mode="edit"
        category={category}
        allCategories={allCategories}
        onClose={vi.fn()}
      />,
    );
    const hiddenId = document.querySelector<HTMLInputElement>('input[type="hidden"][name="id"]');
    expect(hiddenId?.value).toBe(category.id);
  });
});
