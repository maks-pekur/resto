import { render, screen, cleanup } from '@testing-library/react';
import { describe, expect, it, afterEach } from 'vitest';
import { Settings2 } from 'lucide-react';
import { NavMain, type NavMainItem } from '@/components/nav-main';
import { SidebarProvider } from '@/components/ui/sidebar';

const items: NavMainItem[] = [
  { title: 'Menu', url: '/dashboard/menu', icon: Settings2, scope: 'brand' },
  { title: 'Settings', url: '/dashboard/settings', icon: Settings2, scope: 'tenant' },
  { title: 'Misc', url: '/dashboard/misc', icon: Settings2, scope: 'any' },
];

const renderNav = (activeBrandSlug: string | null) =>
  render(
    <SidebarProvider>
      <NavMain items={items} activeBrandSlug={activeBrandSlug} />
    </SidebarProvider>,
  );

describe('NavMain (scope-aware)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders all items when activeBrandSlug is set (specific brand mode)', () => {
    renderNav('z-burger');
    expect(screen.getByText('Menu')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Misc')).toBeInTheDocument();
  });

  it('hides brand-only items when activeBrandSlug is null (All brands mode)', () => {
    renderNav(null);
    expect(screen.queryByText('Menu')).toBeNull();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Misc')).toBeInTheDocument();
  });
});
