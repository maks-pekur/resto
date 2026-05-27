import { render, screen, cleanup } from '@testing-library/react';
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

const renderSidebar = () =>
  render(
    <SidebarProvider>
      <AppSidebar
        brands={brands}
        activeBrandSlug="cafe-z"
        canViewAllBrands={false}
        operator={operator}
      />
    </SidebarProvider>,
  );

describe('AppSidebar (Phase 02 D-15 cleanup)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders Dashboard, Brands, and Settings nav items only', () => {
    renderSidebar();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Brands')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('does not render shadcn template debris (Playground / Models / Documentation / Travel / Design Engineering / Sales & Marketing)', () => {
    renderSidebar();
    expect(screen.queryByText(/Playground/u)).toBeNull();
    expect(screen.queryByText(/^Models$/u)).toBeNull();
    expect(screen.queryByText(/Documentation/u)).toBeNull();
    expect(screen.queryByText(/Travel/u)).toBeNull();
    expect(screen.queryByText(/Design Engineering/u)).toBeNull();
    expect(screen.queryByText(/Sales & Marketing/u)).toBeNull();
  });

  it('renders the operator email through NavUser (no static placeholder)', () => {
    renderSidebar();
    expect(screen.queryByText('operator@example.com')).toBeNull();
    // Real email is rendered in the NavUser footer.
    const matches = screen.getAllByText('owner@example.test');
    expect(matches.length).toBeGreaterThan(0);
  });
});
