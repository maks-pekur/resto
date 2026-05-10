import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, afterEach } from 'vitest';

const createBrandMock = vi.fn();
vi.mock('@/lib/actions/create-brand', () => ({
  createBrandAction: createBrandMock,
}));

const { BrandForm } = await import('../app/dashboard/brands/new/brand-form-client');

describe('BrandForm', () => {
  afterEach(() => {
    cleanup();
    createBrandMock.mockReset();
  });

  it('renders slug + displayName inputs and a submit button', () => {
    render(<BrandForm />);
    expect(screen.getByLabelText(/Brand name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/URL slug/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create brand/i })).toBeInTheDocument();
  });

  it('renders inline error from the action state', async () => {
    createBrandMock.mockResolvedValue({ error: 'That brand slug is already taken; pick another.' });
    render(<BrandForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Brand name/i), 'Z Burger');
    await user.type(screen.getByLabelText(/URL slug/i), 'z-burger');
    await user.click(screen.getByRole('button', { name: /Create brand/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already taken/i);
  });
});
