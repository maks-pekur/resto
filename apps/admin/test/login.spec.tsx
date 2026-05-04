import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/login/actions', () => ({
  signInAction: vi.fn(),
}));

import { LoginForm } from '@/app/login/login-form-client';

describe('LoginForm (client island)', () => {
  it('renders email + password inputs and a submit button', () => {
    render(<LoginForm next="/dashboard" />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('round-trips the `next` query string through a hidden input', () => {
    const { container } = render(<LoginForm next="/dashboard?tab=overview" />);
    const hidden = container.querySelector('input[type="hidden"][name="next"]');
    expect(hidden).toHaveAttribute('value', '/dashboard?tab=overview');
  });
});
