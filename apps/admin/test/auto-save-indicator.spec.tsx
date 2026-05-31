import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AutoSaveIndicator } from '@/components/menu/auto-save-indicator';

describe('AutoSaveIndicator (D-4b-02, UI-SPEC §Auto-Save Indicator Spec)', () => {
  it('renders nothing on idle state', () => {
    const { container } = render(<AutoSaveIndicator state={{ kind: 'idle' }} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders "Сохранение…" on saving state with aria-live="polite"', () => {
    render(<AutoSaveIndicator state={{ kind: 'saving' }} />);
    const el = screen.getByText('Сохранение…');
    expect(el).toBeInTheDocument();
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.className).toMatch(/text-muted-foreground/u);
    expect(el.className).toMatch(/text-xs/u);
  });

  it('renders "Сохранено Xс назад" on saved state using formatAge', () => {
    const now = 1_780_000_000_000;
    render(<AutoSaveIndicator state={{ kind: 'saved', at: now - 5_000 }} now={now} />);
    expect(screen.getByText(/Сохранено 5с назад/u)).toBeInTheDocument();
  });

  it('renders "Не сохранено — повторить" on failed state and fires retry on click', async () => {
    const retry = vi.fn();
    render(<AutoSaveIndicator state={{ kind: 'failed', retry }} />);
    const root = screen.getByText(/Не сохранено/u);
    expect(root.className).toMatch(/text-destructive/u);
    const button = screen.getByRole('button', { name: 'повторить' });
    await userEvent.click(button);
    expect(retry).toHaveBeenCalledOnce();
  });
});
