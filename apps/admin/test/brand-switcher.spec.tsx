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
      <BrandSwitcher
        brands={brands}
        activeBrandSlug="z-burger"
        canViewAllBrands={true}
        {...props}
      />
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

  it('shows the All brands label when activeBrandSlug is null', () => {
    renderSwitcher({ activeBrandSlug: null });
    expect(screen.getByTestId('brand-switcher-trigger')).toHaveTextContent('All brands');
  });

  it('lists every brand option in the dropdown', async () => {
    const { user } = renderSwitcher();
    await user.click(screen.getByTestId('brand-switcher-trigger'));
    expect(await screen.findByRole('menuitem', { name: /Z Burger/u })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Sushi Master/u })).toBeInTheDocument();
  });

  it('shows the All brands menu entry when canViewAllBrands and brands.length >= 2', async () => {
    const { user } = renderSwitcher();
    await user.click(screen.getByTestId('brand-switcher-trigger'));
    expect(await screen.findByRole('menuitem', { name: /All brands/u })).toBeInTheDocument();
  });

  it('hides the All brands menu entry when canViewAllBrands is false (multi-brand)', async () => {
    const { user } = renderSwitcher({ canViewAllBrands: false });
    await user.click(screen.getByTestId('brand-switcher-trigger'));
    await screen.findByRole('menuitem', { name: /Add brand/u });
    expect(screen.queryByRole('menuitem', { name: /All brands/u })).toBeNull();
  });

  it('shows the Add brand menu entry linking to /onboarding/brand in multi-brand dropdown', async () => {
    const { user } = renderSwitcher();
    await user.click(screen.getByTestId('brand-switcher-trigger'));
    const item = await screen.findByRole('menuitem', { name: /Add brand/u });
    expect(item).toBeInTheDocument();
    const link = item.tagName === 'A' ? item : item.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/onboarding/brand');
  });

  it('renders static label + inline Plus icon when single brand and !canViewAllBrands (CONTEXT D-14)', () => {
    const [first] = brands;
    if (!first) throw new Error('brands fixture missing');
    renderSwitcher({ canViewAllBrands: false, brands: [first], activeBrandSlug: first.slug });
    expect(screen.getByTestId('brand-switcher-static')).toHaveTextContent('Z Burger');
    expect(screen.queryByTestId('brand-switcher-trigger')).toBeNull();
    const addBrandBtn = screen.getByTestId('brand-switcher-add-brand');
    expect(addBrandBtn).toBeInTheDocument();
    const link = addBrandBtn.tagName === 'A' ? addBrandBtn : addBrandBtn.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/onboarding/brand');
  });

  it('renders the dropdown trigger when 2+ brands (multi-brand path preserved)', () => {
    renderSwitcher();
    expect(screen.getByTestId('brand-switcher-trigger')).toBeInTheDocument();
    expect(screen.queryByTestId('brand-switcher-static')).toBeNull();
  });

  it('renders the dropdown when canViewAllBrands is true regardless of brand count', () => {
    const [first] = brands;
    if (!first) throw new Error('brands fixture missing');
    renderSwitcher({ canViewAllBrands: true, brands: [first], activeBrandSlug: first.slug });
    expect(screen.getByTestId('brand-switcher-trigger')).toBeInTheDocument();
    expect(screen.queryByTestId('brand-switcher-static')).toBeNull();
  });

  it('single-brand Plus icon has accessible label "Add brand"', () => {
    const [first] = brands;
    if (!first) throw new Error('brands fixture missing');
    renderSwitcher({ canViewAllBrands: false, brands: [first], activeBrandSlug: first.slug });
    expect(screen.getByLabelText(/Add brand/u)).toBeInTheDocument();
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

  it('calls setActiveBrandAction(null) on All brands click', async () => {
    setActiveBrandMock.mockResolvedValue({ ok: true });
    const { user } = renderSwitcher();
    await user.click(screen.getByTestId('brand-switcher-trigger'));
    await user.click(await screen.findByRole('menuitem', { name: /All brands/u }));
    await waitFor(() => {
      expect(setActiveBrandMock).toHaveBeenCalledWith(null);
    });
  });
});
