import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CategorySelect } from '@/components/menu/category-select';

/**
 * Radix Select renders its content lazily via a portal once the trigger is
 * opened. Asserting on the raw `<SelectItem>` data slots inside the closed
 * select isn't possible without opening it programmatically — and JSDOM
 * doesn't drive the pointer events that open Radix's popover. We instead
 * use a thin mock for the Select primitives that exposes everything
 * synchronously, mirroring how the production code wires `Select`.
 */
vi.mock('@/components/ui/select', () => {
  return {
    Select: ({
      children,
      value,
      onValueChange,
      disabled,
    }: {
      children: React.ReactNode;
      value?: string;
      onValueChange?: (v: string) => void;
      disabled?: boolean;
    }) => (
      <div
        data-slot="select"
        data-value={value ?? ''}
        data-disabled={disabled ? 'true' : 'false'}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          const itemValue = target.getAttribute('data-value');
          const itemDisabled = target.getAttribute('data-disabled') === 'true';
          if (itemValue && !itemDisabled && onValueChange) onValueChange(itemValue);
        }}
      >
        {children}
      </div>
    ),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => (
      <div data-slot="select-trigger">{children}</div>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => (
      <span data-slot="select-value">{placeholder}</span>
    ),
    SelectContent: ({ children }: { children: React.ReactNode }) => (
      <div data-slot="select-content">{children}</div>
    ),
    SelectItem: ({
      children,
      value,
      disabled,
      className,
      'aria-disabled': ariaDisabled,
    }: {
      children: React.ReactNode;
      value: string;
      disabled?: boolean;
      className?: string;
      'aria-disabled'?: 'true' | 'false' | boolean;
    }) => (
      <div
        data-slot="select-item"
        data-value={value}
        data-disabled={disabled ? 'true' : 'false'}
        aria-disabled={ariaDisabled}
        className={className}
      >
        {children}
      </div>
    ),
  };
});

const PARENT_UUID = '11111111-1111-4111-8111-111111111111';
const CHILD_UUID = '22222222-2222-4222-8222-222222222222';

const baseCategories = [
  { id: PARENT_UUID, name: 'Напитки', parentId: null },
  { id: CHILD_UUID, name: 'Кофе', parentId: PARENT_UUID },
];

describe('CategorySelect (D-4b-01, RESEARCH.md Pattern 5)', () => {
  it("parent-picker mode disables child options with the muted '(уже является подкатегорией)' label", () => {
    render(
      <CategorySelect
        categories={baseCategories}
        value={null}
        onChange={vi.fn()}
        mode="parent-picker"
      />,
    );
    // Disabled child option must include the muted label suffix
    expect(screen.getByText(/Кофе \(уже является подкатегорией\)/u)).toBeInTheDocument();
    const childItem = screen
      .getAllByRole('generic', { hidden: true })
      .find((el) => el.getAttribute('data-value') === CHILD_UUID);
    expect(childItem?.getAttribute('data-disabled')).toBe('true');
    expect(childItem?.getAttribute('aria-disabled')).toBe('true');
  });

  it('parent-picker mode renders the "— Без родителя —" sentinel option', () => {
    render(
      <CategorySelect
        categories={baseCategories}
        value={null}
        onChange={vi.fn()}
        mode="parent-picker"
      />,
    );
    expect(screen.getByText(/— Без родителя —/u)).toBeInTheDocument();
  });

  it('item-picker mode renders all options with ↳ prefix on children', () => {
    render(
      <CategorySelect
        categories={baseCategories}
        value={null}
        onChange={vi.fn()}
        mode="item-picker"
      />,
    );
    expect(screen.getByText('Напитки')).toBeInTheDocument();
    expect(screen.getByText('↳ Кофе')).toBeInTheDocument();
    // item-picker has no "— Без родителя —" sentinel
    expect(screen.queryByText(/— Без родителя —/u)).not.toBeInTheDocument();
  });

  it('item-picker mode does NOT disable child options', () => {
    render(
      <CategorySelect
        categories={baseCategories}
        value={null}
        onChange={vi.fn()}
        mode="item-picker"
      />,
    );
    const childItem = screen
      .getAllByRole('generic', { hidden: true })
      .find((el) => el.getAttribute('data-value') === CHILD_UUID);
    expect(childItem?.getAttribute('data-disabled')).toBe('false');
  });

  it('calls onChange(null) when the "— Без родителя —" option is selected', () => {
    const onChange = vi.fn();
    render(
      <CategorySelect
        categories={baseCategories}
        value={PARENT_UUID}
        onChange={onChange}
        mode="parent-picker"
      />,
    );
    const noneOption = screen
      .getAllByRole('generic', { hidden: true })
      .find((el) => el.getAttribute('data-value') === '__none__');
    noneOption?.click();
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('calls onChange(parentId) when a top-level option is selected (parent-picker)', () => {
    const onChange = vi.fn();
    render(
      <CategorySelect
        categories={baseCategories}
        value={null}
        onChange={onChange}
        mode="parent-picker"
      />,
    );
    const parentOption = screen
      .getAllByRole('generic', { hidden: true })
      .find((el) => el.getAttribute('data-value') === PARENT_UUID);
    parentOption?.click();
    expect(onChange).toHaveBeenCalledWith(PARENT_UUID);
  });
});
