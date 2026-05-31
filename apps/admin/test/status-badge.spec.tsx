import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '@/components/menu/status-badge';

describe('StatusBadge (D-09, UI-SPEC §Status badge color semantics)', () => {
  it('renders draft with Черновик label + outline variant', () => {
    const { container } = render(<StatusBadge status="draft" />);
    expect(screen.getByText('Черновик')).toBeInTheDocument();
    const badge = container.querySelector('[data-slot="badge"]');
    expect(badge?.getAttribute('data-variant')).toBe('outline');
  });

  it('renders modified with Изменено label + amber className', () => {
    const { container } = render(<StatusBadge status="modified" />);
    expect(screen.getByText('Изменено')).toBeInTheDocument();
    const badge = container.querySelector('[data-slot="badge"]');
    expect(badge?.getAttribute('data-variant')).toBe('outline');
    expect(badge?.className).toMatch(/border-amber-500/u);
    expect(badge?.className).toMatch(/text-amber-700/u);
  });

  it('renders published with Опубликовано label + default variant', () => {
    const { container } = render(<StatusBadge status="published" />);
    expect(screen.getByText('Опубликовано')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="badge"]')?.getAttribute('data-variant')).toBe(
      'default',
    );
  });

  it('renders paused with Стоп label + secondary variant (GM MED-1: not destructive)', () => {
    const { container } = render(<StatusBadge status="paused" />);
    expect(screen.getByText('Стоп')).toBeInTheDocument();
    const badge = container.querySelector('[data-slot="badge"]');
    expect(badge?.getAttribute('data-variant')).toBe('secondary');
    expect(badge?.getAttribute('data-variant')).not.toBe('destructive');
  });

  it('renders archived with Архив label + ghost variant + muted className', () => {
    const { container } = render(<StatusBadge status="archived" />);
    expect(screen.getByText('Архив')).toBeInTheDocument();
    const badge = container.querySelector('[data-slot="badge"]');
    expect(badge?.getAttribute('data-variant')).toBe('ghost');
    expect(badge?.className).toMatch(/text-muted-foreground/u);
  });

  it('carries aria-label "Статус: {label}" for screen readers', () => {
    render(<StatusBadge status="paused" />);
    const badge = screen.getByLabelText('Статус: Стоп');
    expect(badge).toBeInTheDocument();
  });
});
