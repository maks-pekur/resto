import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeToggle } from '@resto/ui';
import { ThemeProvider, useTheme } from '@/components/common/theme-provider';

const Toggle = () => {
  const { resolvedTheme, toggleTheme } = useTheme();
  return <ThemeToggle resolvedTheme={resolvedTheme} onToggle={toggleTheme} label="Theme" />;
};

const renderToggle = () =>
  render(
    <ThemeProvider>
      <Toggle />
    </ThemeProvider>,
  );

const toggle = () => screen.getByRole('button', { name: 'Theme' });

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = '';
});

afterEach(() => {
  document.documentElement.className = '';
});

describe('admin theme toggle', () => {
  it('follows the system theme until the operator presses it', () => {
    renderToggle();

    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(window.localStorage.getItem('vite-ui-theme')).toBeNull();
  });

  it('switches to dark and remembers the choice', () => {
    renderToggle();

    fireEvent.click(toggle());

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem('vite-ui-theme')).toBe('dark');
  });

  it('toggles back to light on a second press', () => {
    renderToggle();

    fireEvent.click(toggle());
    fireEvent.click(toggle());

    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(window.localStorage.getItem('vite-ui-theme')).toBe('light');
  });

  it('restores the remembered choice on the next load', () => {
    window.localStorage.setItem('vite-ui-theme', 'dark');

    renderToggle();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
