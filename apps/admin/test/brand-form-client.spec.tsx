import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, afterEach } from 'vitest';

const createBrandMock = vi.fn();
vi.mock('@/lib/actions/create-brand', () => ({
  createBrandAction: createBrandMock,
}));

// Default to "available" so RES-179 cases (no real availability concern)
// still pass; RES-180 specs override per-test as needed.
const checkSlugMock = vi.fn().mockResolvedValue({
  available: true,
  suggestion: null,
  error: null,
});
vi.mock('@/lib/actions/check-brand-slug', () => ({
  checkBrandSlugAvailability: checkSlugMock,
}));

const { BrandForm } = await import('../app/(onboarding)/onboarding/brand/brand-form-client');

describe('BrandForm', () => {
  afterEach(() => {
    cleanup();
    createBrandMock.mockReset();
    checkSlugMock.mockReset();
    checkSlugMock.mockResolvedValue({ available: true, suggestion: null, error: null });
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

  it('shows "Available" once the debounced check resolves (RES-180)', async () => {
    checkSlugMock.mockResolvedValue({ available: true, suggestion: null, error: null });
    render(<BrandForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Brand name/i), 'Z Burger');
    expect(await screen.findByText(/Available\./i)).toBeInTheDocument();
    expect(checkSlugMock).toHaveBeenCalledWith('z-burger');
  });

  it('auto-applies the suggestion when the slug was auto-generated (RES-180)', async () => {
    checkSlugMock.mockResolvedValue({
      available: false,
      suggestion: 'z-burger-2',
      error: null,
    });
    render(<BrandForm />);
    const user = userEvent.setup();
    const slug = screen.getByLabelText<HTMLInputElement>(/URL slug/i);
    await user.type(screen.getByLabelText(/Brand name/i), 'Z Burger');
    // Wait for the auto-suffix to land in the input.
    await screen.findByText(/Taken\./i);
    expect(slug.value).toBe('z-burger-2');
  });

  it('surfaces the suggestion as a clickable hint when the slug was edited manually (RES-180)', async () => {
    checkSlugMock.mockResolvedValue({
      available: false,
      suggestion: 'mine-2',
      error: null,
    });
    render(<BrandForm />);
    const user = userEvent.setup();
    const slug = screen.getByLabelText<HTMLInputElement>(/URL slug/i);
    // Manually-entered slug — must NOT be silently overwritten.
    await user.type(slug, 'mine');
    await screen.findByText(/Taken\./i);
    expect(slug.value).toBe('mine');

    // Click the suggestion to apply it explicitly.
    const suggest = await screen.findByRole('button', { name: 'mine-2' });
    await user.click(suggest);
    expect(slug.value).toBe('mine-2');
  });
});
