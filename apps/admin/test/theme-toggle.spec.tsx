import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setThemeMock = vi.fn();
vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme: setThemeMock }),
}));

import { ThemeToggle } from '@/components/theme-toggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    setThemeMock.mockClear();
  });

  it('renders the toggle trigger', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument();
  });

  it.each([
    ['Light', 'light'],
    ['Dark', 'dark'],
    ['System', 'system'],
  ])('calls setTheme(%s)', async (label, value) => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button', { name: /toggle theme/i }));
    await user.click(await screen.findByText(label));
    expect(setThemeMock).toHaveBeenCalledWith(value);
  });
});
