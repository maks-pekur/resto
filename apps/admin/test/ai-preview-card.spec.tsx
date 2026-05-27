import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/actions/notify-list-signup', () => ({
  notifyListSignupAction: vi.fn(() => Promise.resolve({ ok: false, error: null })),
}));

import { AiPreviewCard } from '../components/ai-preview-card';

describe('AiPreviewCard', () => {
  it('renders the verbatim CONTEXT D-17 Russian-locked header', () => {
    render(<AiPreviewCard />);
    expect(screen.getByText('AI-помощник скоро будет')).toBeInTheDocument();
  });

  it('renders the Launching Q2 2027 caption', () => {
    render(<AiPreviewCard />);
    expect(screen.getByText(/Launching Q2 2027/u)).toBeInTheDocument();
  });

  it('renders the email input and Notify me submit button', () => {
    render(<AiPreviewCard />);
    const input = screen.getByLabelText(/email/iu);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('required');
    expect(screen.getByRole('button', { name: /notify me/iu })).toBeInTheDocument();
  });

  it('uses no exclamation marks in static copy (CONTEXT D-08 voice)', () => {
    const { container } = render(<AiPreviewCard />);
    expect(container.textContent).not.toContain('!');
  });
});
