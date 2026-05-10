import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, afterEach } from 'vitest';

const createBrandMock = vi.fn();
vi.mock('@/lib/actions/create-brand', () => ({
  createBrandAction: createBrandMock,
}));

const { BrandForm } = await import('../app/(onboarding)/onboarding/brand/brand-form-client');

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
    await user.click(screen.getByRole('button', { name: /Create brand/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already taken/i);
  });

  it('auto-fills the slug from the brand name (RES-179)', async () => {
    render(<BrandForm />);
    const user = userEvent.setup();
    const slug = screen.getByLabelText<HTMLInputElement>(/URL slug/i);
    await user.type(screen.getByLabelText(/Brand name/i), 'Z Burger');
    expect(slug.value).toBe('z-burger');
  });

  it('stops auto-filling once the slug is edited manually', async () => {
    render(<BrandForm />);
    const user = userEvent.setup();
    const slug = screen.getByLabelText<HTMLInputElement>(/URL slug/i);
    const name = screen.getByLabelText(/Brand name/i);

    await user.type(name, 'Z Burger');
    expect(slug.value).toBe('z-burger');

    await user.clear(slug);
    await user.type(slug, 'custom-slug');
    expect(slug.value).toBe('custom-slug');

    // Further name typing must NOT overwrite the manually-entered slug.
    await user.type(name, ' East');
    expect(slug.value).toBe('custom-slug');
  });

  it('resumes auto-fill when the slug is cleared back to empty', async () => {
    render(<BrandForm />);
    const user = userEvent.setup();
    const slug = screen.getByLabelText<HTMLInputElement>(/URL slug/i);
    const name = screen.getByLabelText(/Brand name/i);

    await user.type(name, 'Z Burger');
    await user.clear(slug);
    await user.type(slug, 'custom');
    expect(slug.value).toBe('custom');

    // Wipe the slug — re-arms auto-fill on the next name keystroke.
    await user.clear(slug);
    await user.clear(name);
    await user.type(name, 'B Burger');
    expect(slug.value).toBe('b-burger');
  });
});
