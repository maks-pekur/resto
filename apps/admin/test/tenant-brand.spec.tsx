import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TenantBrand } from '@/components/tenant-brand';
import { SidebarProvider } from '@/components/ui/sidebar';

const renderInSidebar = (tenant: { displayName: string; slug: string }) =>
  render(
    <SidebarProvider>
      <TenantBrand tenant={{ ...tenant }} />
    </SidebarProvider>,
  );

describe('TenantBrand', () => {
  it('renders the displayName and slug', () => {
    renderInSidebar({ displayName: 'Cafe Roma', slug: 'cafe-roma' });
    expect(screen.getByTestId('tenant-brand-name')).toHaveTextContent('Cafe Roma');
    expect(screen.getByText('cafe-roma')).toBeInTheDocument();
  });

  it('uses two-letter initials for two-word names', () => {
    renderInSidebar({ displayName: 'Cafe Roma', slug: 'cafe-roma' });
    expect(screen.getByTestId('tenant-brand-logo')).toHaveTextContent('CR');
  });

  it('takes first two chars for single-word names', () => {
    renderInSidebar({ displayName: 'Demo', slug: 'demo' });
    expect(screen.getByTestId('tenant-brand-logo')).toHaveTextContent('DE');
  });

  it('uses first + last word initials for 3+ words', () => {
    renderInSidebar({ displayName: 'Best Pizza Place', slug: 'best-pizza' });
    expect(screen.getByTestId('tenant-brand-logo')).toHaveTextContent('BP');
  });

  it('uppercases initials regardless of input casing', () => {
    renderInSidebar({ displayName: 'cafe roma', slug: 'cafe-roma' });
    expect(screen.getByTestId('tenant-brand-logo')).toHaveTextContent('CR');
  });
});
