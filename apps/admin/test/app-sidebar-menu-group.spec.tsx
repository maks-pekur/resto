import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, afterEach } from 'vitest';

vi.mock('@/lib/actions/set-active-brand', () => ({
  setActiveBrandAction: vi.fn(),
}));
vi.mock('@/lib/actions/sign-out', () => ({
  signOutAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme: vi.fn() }),
}));

const { AppSidebar } = await import('../components/app-sidebar');
import { SidebarProvider } from '@/components/ui/sidebar';

const brands = [{ id: 'b-1', slug: 'cafe-z', displayName: 'Cafe Z' }];
const operator = { email: 'owner@example.test', baseRole: 'owner' as const };

const renderSidebar = (activeBrandSlug: string | null = 'cafe-z') =>
  render(
    <SidebarProvider>
      <AppSidebar brands={brands} activeBrandSlug={activeBrandSlug} operator={operator} />
    </SidebarProvider>,
  );

describe('AppSidebar — Menu group (D-01, Plan 04b-04 Wave 3)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the "Меню" collapsible group when an active brand is selected', () => {
    renderSidebar('cafe-z');
    expect(screen.getByText('Меню')).toBeInTheDocument();
  });

  it('hides the Меню group in All-brands mode (scope: brand)', () => {
    renderSidebar(null);
    expect(screen.queryByText('Меню')).toBeNull();
  });

  it('keeps the Меню group collapsed by default (sub-routes hidden) — D-01 collapsed-by-default contract', () => {
    renderSidebar('cafe-z');
    expect(screen.queryByText('Категории')).toBeNull();
    expect(screen.queryByText('Блюда')).toBeNull();
  });

  it('renders the 4 sub-routes after expanding the Меню group', async () => {
    renderSidebar('cafe-z');
    const trigger = screen.getByText('Меню');
    await userEvent.click(trigger);
    expect(screen.getByText('Категории')).toBeInTheDocument();
    expect(screen.getByText('Блюда')).toBeInTheDocument();
    expect(screen.getByText('Модификаторы')).toBeInTheDocument();
    expect(screen.getByText('Стоп-лист')).toBeInTheDocument();
  });

  it('links each sub-route to its /dashboard/menu/* URL once expanded', async () => {
    renderSidebar('cafe-z');
    await userEvent.click(screen.getByText('Меню'));
    expect(screen.getByText('Категории').closest('a')?.getAttribute('href')).toBe(
      '/dashboard/menu/categories',
    );
    expect(screen.getByText('Блюда').closest('a')?.getAttribute('href')).toBe(
      '/dashboard/menu/items',
    );
    expect(screen.getByText('Модификаторы').closest('a')?.getAttribute('href')).toBe(
      '/dashboard/menu/modifier-groups',
    );
    expect(screen.getByText('Стоп-лист').closest('a')?.getAttribute('href')).toBe(
      '/dashboard/menu/stop-list',
    );
  });
});
