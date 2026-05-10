import { describe, expect, it, vi, beforeEach } from 'vitest';

const apiFetchMock = vi.fn();
const cookiesSetMock = vi.fn();
const redirectMock = vi.fn(() => {
  throw new Error('REDIRECT');
});

vi.mock('@/lib/api-server', () => ({ apiFetch: apiFetchMock }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ set: cookiesSetMock })),
}));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));

const { createBrandAction } = await import('../lib/actions/create-brand');

const buildForm = (over: Record<string, string> = {}): FormData => {
  const fd = new FormData();
  fd.set('slug', 'z-burger');
  fd.set('displayName', 'Z Burger');
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
};

describe('createBrandAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns inline validation error for an invalid slug shape', async () => {
    const result = await createBrandAction({ error: null }, buildForm({ slug: '-not-a-slug' }));
    expect(result.error).toMatch(/slug/i);
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(cookiesSetMock).not.toHaveBeenCalled();
  });

  it('posts to /v1/me/brands, sets active_brand cookie, and redirects on 201', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      data: { id: 'brand-uuid', slug: 'z-burger', displayName: 'Z Burger' },
      raw: new Response(),
    });
    await expect(createBrandAction({ error: null }, buildForm())).rejects.toThrow('REDIRECT');
    expect(apiFetchMock).toHaveBeenCalledWith('/v1/me/brands', {
      method: 'POST',
      body: { slug: 'z-burger', displayName: 'Z Burger' },
    });
    expect(cookiesSetMock).toHaveBeenCalledWith('resto.active_brand', 'z-burger', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
    expect(redirectMock).toHaveBeenCalledWith('/dashboard');
  });

  it('surfaces brand.slug_taken friendly message', async () => {
    apiFetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      data: { code: 'brand.slug_taken', message: 'taken' },
      raw: new Response(),
    });
    const result = await createBrandAction({ error: null }, buildForm());
    expect(result.error).toMatch(/already taken/i);
    expect(cookiesSetMock).not.toHaveBeenCalled();
  });

  it('surfaces 500 with a generic message', async () => {
    apiFetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      data: { code: 'internal' },
      raw: new Response(),
    });
    const result = await createBrandAction({ error: null }, buildForm());
    expect(result.error).toMatch(/Something went wrong/);
  });
});
