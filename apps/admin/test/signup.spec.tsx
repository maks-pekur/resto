import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SignUpForm } from '../app/signup/signup-form-client';

vi.mock('../app/signup/actions', () => ({ signUpAction: vi.fn() }));

describe('SignUpForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it('renders the four inputs', () => {
    render(<SignUpForm />);
    expect(screen.getByLabelText(/Restaurant name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email$/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Currency/)).toBeInTheDocument();
  });

  it('shows submit button enabled by default', () => {
    render(<SignUpForm />);
    expect(screen.getByRole('button', { name: /Create account/ })).toBeEnabled();
  });
});
