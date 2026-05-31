import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

/**
 * Plan 04b-06 Task 2 — ItemsFilterBarClient
 *
 * The filter bar drives URL state. Search is debounced 300ms (mirrors
 * brand-form-client.tsx slug-availability pattern). Status + category
 * selects push immediately. Every filter change resets `page=1`.
 */

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Use a thin stub for the Radix Select to keep the test synchronous
// (mirrors the pattern used in category-select.spec.tsx).
vi.mock('@/components/ui/select', () => {
  return {
    Select: ({
      children,
      value,
      onValueChange,
    }: {
      children: React.ReactNode;
      value?: string;
      onValueChange?: (v: string) => void;
    }) => (
      <div
        data-slot="select"
        data-value={value ?? ''}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          const itemValue = target.getAttribute('data-value');
          if (itemValue && onValueChange) onValueChange(itemValue);
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
    SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
      <div data-slot="select-item" data-value={value}>
        {children}
      </div>
    ),
  };
});

const { ItemsFilterBarClient } =
  await import('@/app/dashboard/(workspace)/menu/items/items-filter-bar-client');

const PARENT_A = '11111111-1111-4111-8111-111111111111';
const CHILD_A1 = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const categories = [
  { id: PARENT_A, name: 'Напитки', parentId: null },
  { id: CHILD_A1, name: 'Кофе', parentId: PARENT_A },
];

describe('ItemsFilterBarClient (Plan 04b-06 Task 2)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    pushMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the search input with the Russian placeholder', () => {
    render(
      <ItemsFilterBarClient
        categories={categories}
        currentFilters={{ status: 'all-except-archived', categoryId: null, q: '' }}
      />,
    );
    expect(screen.getByPlaceholderText('Поиск блюд…')).toBeInTheDocument();
  });

  it('debounces the search input by 300ms before pushing URL state', () => {
    render(
      <ItemsFilterBarClient
        categories={categories}
        currentFilters={{ status: 'all-except-archived', categoryId: null, q: '' }}
      />,
    );
    const input = screen.getByPlaceholderText('Поиск блюд…');
    fireEvent.change(input, { target: { value: 'кофе' } });
    expect(pushMock).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(pushMock).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(pushMock).toHaveBeenCalledTimes(1);
    const call = pushMock.mock.calls[0]?.[0] as string;
    expect(call).toContain('q=%D0%BA%D0%BE%D1%84%D0%B5');
    expect(call).toContain('page=1');
  });

  it('omits empty filters from the URL and resets page on filter change', () => {
    render(
      <ItemsFilterBarClient
        categories={categories}
        currentFilters={{ status: 'all-except-archived', categoryId: null, q: '' }}
      />,
    );
    const select = screen.getAllByRole('generic', { hidden: true });
    const draftOption = select.find((el) => el.getAttribute('data-value') === 'draft');
    expect(draftOption).toBeTruthy();
    draftOption?.click();
    expect(pushMock).toHaveBeenCalledTimes(1);
    const url = pushMock.mock.calls[0]?.[0] as string;
    expect(url).toContain('status=draft');
    expect(url).toContain('page=1');
    expect(url).not.toContain('category=');
    expect(url).not.toContain('q=');
  });

  it('immediately pushes URL state when a category option is picked', () => {
    render(
      <ItemsFilterBarClient
        categories={categories}
        currentFilters={{ status: 'all-except-archived', categoryId: null, q: '' }}
      />,
    );
    const select = screen.getAllByRole('generic', { hidden: true });
    const cat = select.find((el) => el.getAttribute('data-value') === PARENT_A);
    cat?.click();
    expect(pushMock).toHaveBeenCalledTimes(1);
    const url = pushMock.mock.calls[0]?.[0] as string;
    expect(url).toContain(`category=${PARENT_A}`);
  });
});
