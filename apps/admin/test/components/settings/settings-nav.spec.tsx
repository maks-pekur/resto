import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Store, ShieldCheck } from 'lucide-react';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    search,
    ...props
  }: {
    children: React.ReactNode;
    search?: Record<string, string>;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={`/settings?setting=${search?.setting ?? ''}`} {...props}>
      {children}
    </a>
  ),
}));

const { SettingsNav } = await import('@/components/settings/settings-nav');

const items = [
  { value: 'profile', label: 'Профиль', icon: Store },
  { value: 'security', label: 'Безопасность', icon: ShieldCheck },
];

describe('SettingsNav', () => {
  it('addresses every section, so a operator can bookmark one', () => {
    render(<SettingsNav items={items} active="profile" ariaLabel="Разделы" />);

    expect(screen.getByRole('link', { name: 'Безопасность' })).toHaveAttribute(
      'href',
      '/settings?setting=security',
    );
  });

  it('marks the open section for assistive tech, not only by colour', () => {
    render(<SettingsNav items={items} active="security" ariaLabel="Разделы" />);

    expect(screen.getByTestId('settings-nav-security')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('settings-nav-profile')).not.toHaveAttribute('aria-current');
  });
});
