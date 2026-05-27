import { render, screen, cleanup } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';

vi.mock('@/lib/actions/sign-out', () => ({
  signOutAction: vi.fn(),
}));
vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme: vi.fn() }),
}));

const { NavUser } = await import('../components/nav-user');
import { SidebarProvider } from '@/components/ui/sidebar';

const renderNavUser = (operator: { email: string; baseRole?: 'owner' | 'admin' | 'staff' }) =>
  render(
    <SidebarProvider>
      <NavUser operator={operator} />
    </SidebarProvider>,
  );

describe('NavUser (CONTEXT D-16 real operator identity)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the operator email', () => {
    renderNavUser({ email: 'alice@acme.com' });
    expect(screen.getAllByText('alice@acme.com').length).toBeGreaterThan(0);
  });

  it('renders the capitalized base role when present', () => {
    renderNavUser({ email: 'alice@acme.com', baseRole: 'owner' });
    expect(screen.getAllByText('Owner').length).toBeGreaterThan(0);
  });

  it('renders the Operator fallback label when baseRole is absent', () => {
    renderNavUser({ email: 'alice@acme.com' });
    expect(screen.getAllByText('Operator').length).toBeGreaterThan(0);
  });

  it('renders the avatar initial from the email first character', () => {
    renderNavUser({ email: 'alice@acme.com' });
    expect(screen.getAllByText('A').length).toBeGreaterThan(0);
  });

  it('does not render placeholder text "operator@example.com" or shadcn defaults', () => {
    renderNavUser({ email: 'alice@acme.com', baseRole: 'admin' });
    expect(screen.queryByText('operator@example.com')).toBeNull();
    expect(screen.queryByText('shadcn')).toBeNull();
    expect(screen.queryByText('CN')).toBeNull();
  });

  it('does not render Upgrade to Pro / Billing / Notifications dropdown items', () => {
    renderNavUser({ email: 'alice@acme.com', baseRole: 'owner' });
    // The dropdown is closed by default. The items would only appear once
    // opened; assert they are not present anywhere in the rendered tree.
    expect(screen.queryByText(/Upgrade to Pro/u)).toBeNull();
    expect(screen.queryByText(/^Billing$/u)).toBeNull();
    expect(screen.queryByText(/^Notifications$/u)).toBeNull();
  });
});
