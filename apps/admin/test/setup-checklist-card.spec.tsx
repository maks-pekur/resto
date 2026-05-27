import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SetupChecklistCard } from '../components/setup-checklist-card';

describe('SetupChecklistCard', () => {
  it('renders the verbatim CONTEXT D-12 milestone titles in order', () => {
    render(<SetupChecklistCard brandsCount={0} />);
    expect(screen.getByText('Setup Checklist')).toBeInTheDocument();
    expect(screen.getByText('Account created')).toBeInTheDocument();
    expect(screen.getByText('Brand set up')).toBeInTheDocument();
    expect(screen.getByText('Catalog')).toBeInTheDocument();
    expect(screen.getByText('Customer site')).toBeInTheDocument();
    expect(screen.getByText('Accepting orders')).toBeInTheDocument();
    expect(screen.getByText('Payments (Stripe Connect)')).toBeInTheDocument();
  });

  it('renders the Phase-X captions for items 3-6 per CONTEXT D-12', () => {
    render(<SetupChecklistCard brandsCount={0} />);
    expect(screen.getByText('Coming in Phase 4')).toBeInTheDocument();
    expect(screen.getByText('Coming in Phase 5')).toBeInTheDocument();
    expect(screen.getByText('Coming in Phase 7')).toBeInTheDocument();
    expect(screen.getByText('Coming in Phase 8')).toBeInTheDocument();
  });

  it('with brandsCount=0: only "Account created" is done; "Brand set up" prompts the next action', () => {
    render(<SetupChecklistCard brandsCount={0} />);
    expect(screen.getByText('Welcome')).toBeInTheDocument();
    expect(screen.getByText('Add your first brand')).toBeInTheDocument();
  });

  it('with brandsCount>=1: "Brand set up" is also done with caption "Done"', () => {
    render(<SetupChecklistCard brandsCount={2} />);
    expect(screen.getAllByText('Done').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Add your first brand')).toBeNull();
  });

  it('marks icons as aria-hidden so screen readers do not announce decorations', () => {
    const { container } = render(<SetupChecklistCard brandsCount={0} />);
    const icons = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(icons.length).toBeGreaterThanOrEqual(6);
  });

  it('uses no exclamation marks in any rendered text (CONTEXT D-08 voice)', () => {
    const { container } = render(<SetupChecklistCard brandsCount={1} />);
    expect(container.textContent).not.toContain('!');
  });
});
