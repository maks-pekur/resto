import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn(), themes: ['light', 'dark', 'system'] }),
}));

import SignUpPage from '../app/signup/page';
import ForgotPasswordPage from '../app/forgot-password/page';
import ResetPasswordPage from '../app/reset-password/page';

describe('Phase 03 placeholder pages — render EmptyState forbidden variant (CONTEXT D-02)', () => {
  it('signup page renders the forbidden-variant EmptyState with invite-only copy', () => {
    render(<SignUpPage />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/invite-only/iu)).toBeInTheDocument();
    const backLink = screen.getByRole('link', { name: /back to sign in/iu });
    expect(backLink).toHaveAttribute('href', '/login');
  });

  it('signup page does NOT render the SignUpForm', () => {
    render(<SignUpPage />);
    expect(screen.queryByText(/Create your Resto account/iu)).toBeNull();
    expect(screen.queryByLabelText(/^email$/iu)).toBeNull();
    expect(screen.queryByLabelText(/^password$/iu)).toBeNull();
  });

  it('forgot-password page renders the forbidden-variant EmptyState with Phase 03 copy', () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/coming in Phase 03/iu)).toBeInTheDocument();
    const backLink = screen.getByRole('link', { name: /back to sign in/iu });
    expect(backLink).toHaveAttribute('href', '/login');
  });

  it('forgot-password page does NOT render the ForgotPasswordForm', () => {
    render(<ForgotPasswordPage />);
    expect(screen.queryByText(/Reset your password/iu)).toBeNull();
    expect(screen.queryByLabelText(/^email$/iu)).toBeNull();
  });

  it('reset-password page renders the forbidden-variant EmptyState regardless of token param', () => {
    render(<ResetPasswordPage />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/coming in Phase 03/iu)).toBeInTheDocument();
    const backLink = screen.getByRole('link', { name: /back to sign in/iu });
    expect(backLink).toHaveAttribute('href', '/login');
  });

  it('reset-password page does NOT render the ResetPasswordForm', () => {
    render(<ResetPasswordPage />);
    expect(screen.queryByText(/Choose a new password/iu)).toBeNull();
    expect(screen.queryByLabelText(/password/iu)).toBeNull();
  });
});
