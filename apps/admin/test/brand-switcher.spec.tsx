import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, afterEach } from 'vitest';

const setActiveBrandMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('@/lib/actions/set-active-brand', () => ({
  setActiveBrandAction: setActiveBrandMock,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const { BrandSwitcher } = await import('../components/brand-switcher');
import { SidebarProvider } from '@/components/ui/sidebar';
import { BRAND_TAB_SYNC_STORAGE_KEY } from '@/components/brand-tab-sync';

const brands = [
  { id: 'b-1', slug: 'z-burger', displayName: 'Z Burger' },
  { id: 'b-2', slug: 'sushi-master', displayName: 'Sushi Master' },
];

const renderSwitcher = (props: Partial<React.ComponentProps<typeof BrandSwitcher>> = {}) => {
  const user = userEvent.setup();
  const result = render(
    <SidebarProvider>
      <BrandSwitcher brands={brands} activeBrandSlug="z-burger" {...props} />
    </SidebarProvider>,
  );
  return { user, ...result };
};

describe('BrandSwitcher', () => {
  afterEach(() => {
    cleanup();
    setActiveBrandMock.mockReset();
    refreshMock.mockReset();
    window.localStorage.clear();
  });

  it('renders the active brand label in the trigger', () => {
    renderSwitcher();
    expect(screen.getByTestId('brand-switcher-trigger')).toHaveTextContent('Z Burger');
  });

  it('falls back to first brand when activeBrandSlug is null', () => {
    renderSwitcher({ activeBrandSlug: null });
    expect(screen.getByTestId('brand-switcher-trigger')).toHaveTextContent('Z Burger');
  });

  it('falls back to first brand when activeBrandSlug is stale (not in list)', () => {
    renderSwitcher({ activeBrandSlug: 'deleted-brand' });
    expect(screen.getByTestId('brand-switcher-trigger')).toHaveTextContent('Z Burger');
  });

  it('lists every brand option in the dropdown', async () => {
    const { user } = renderSwitcher();
    await user.click(screen.getByTestId('brand-switcher-trigger'));
    expect(await screen.findByRole('menuitem', { name: /Z Burger/u })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Sushi Master/u })).toBeInTheDocument();
  });

  it('never shows an "All brands" menu entry', async () => {
    const { user } = renderSwitcher();
    await user.click(screen.getByTestId('brand-switcher-trigger'));
    await screen.findByRole('menuitem', { name: /Add brand/u });
    expect(screen.queryByRole('menuitem', { name: /All brands/u })).toBeNull();
  });

  it('shows the Add brand menu entry linking to /onboarding/brand', async () => {
    const { user } = renderSwitcher();
    await user.click(screen.getByTestId('brand-switcher-trigger'));
    const item = await screen.findByRole('menuitem', { name: /Add brand/u });
    expect(item).toBeInTheDocument();
    const link = item.tagName === 'A' ? item : item.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/onboarding/brand');
  });

  it('renders the dropdown trigger with a single brand (no static branch)', async () => {
    const [first] = brands;
    if (!first) throw new Error('brands fixture missing');
    const { user } = renderSwitcher({ brands: [first], activeBrandSlug: first.slug });
    expect(screen.getByTestId('brand-switcher-trigger')).toHaveTextContent('Z Burger');
    await user.click(screen.getByTestId('brand-switcher-trigger'));
    expect(await screen.findByRole('menuitem', { name: /Z Burger/u })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Add brand/u })).toBeInTheDocument();
  });

  it('calls setActiveBrandAction(slug) on brand click and signals other tabs via localStorage', async () => {
    setActiveBrandMock.mockResolvedValue({ ok: true });
    const { user } = renderSwitcher();
    await user.click(screen.getByTestId('brand-switcher-trigger'));
    await user.click(await screen.findByRole('menuitem', { name: /Sushi Master/u }));
    await waitFor(() => {
      expect(setActiveBrandMock).toHaveBeenCalledWith('sushi-master');
    });
    expect(window.localStorage.getItem(BRAND_TAB_SYNC_STORAGE_KEY)).not.toBeNull();
    expect(refreshMock).toHaveBeenCalled();
  });
});
