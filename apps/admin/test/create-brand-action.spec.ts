import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const apiFetchMock = vi.fn();
const cookiesSetMock = vi.fn();
const redirectMock = vi.fn(() => {
  throw new Error('REDIRECT');
});
const signActiveBrandMock = vi.fn((slug: string) => `${slug}.mocked-sig`);

vi.mock('@/lib/api-server', () => ({ apiFetch: apiFetchMock }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ set: cookiesSetMock })),
}));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('@/lib/active-brand-cookie', () => ({ signActiveBrand: signActiveBrandMock }));

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

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns inline validation error for an invalid slug shape', async () => {
    const result = await createBrandAction({ error: null }, buildForm({ slug: '-not-a-slug' }));
    expect(result.error).toMatch(/slug/i);
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(cookiesSetMock).not.toHaveBeenCalled();
  });

  it('posts to /v1/me/brands, sets HMAC-signed active_brand cookie, and redirects on 201', async () => {
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
    expect(signActiveBrandMock).toHaveBeenCalledWith('z-burger');
    expect(cookiesSetMock).toHaveBeenCalledWith('resto.active_brand', 'z-burger.mocked-sig', {
      httpOnly: true,
      secure: false,
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

  it('sets cookie with secure:true when NODE_ENV is production (apps/CLAUDE.md, CONTEXT D-04)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      data: { id: 'brand-uuid', slug: 'z-burger', displayName: 'Z Burger' },
      raw: new Response(),
    });
    await expect(createBrandAction({ error: null }, buildForm())).rejects.toThrow('REDIRECT');
    expect(cookiesSetMock).toHaveBeenCalledWith(
      'resto.active_brand',
      'z-burger.mocked-sig',
      expect.objectContaining({ secure: true }),
    );
  });

  it('sets cookie with secure:false when NODE_ENV is development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      data: { id: 'brand-uuid', slug: 'z-burger', displayName: 'Z Burger' },
      raw: new Response(),
    });
    await expect(createBrandAction({ error: null }, buildForm())).rejects.toThrow('REDIRECT');
    expect(cookiesSetMock).toHaveBeenCalledWith(
      'resto.active_brand',
      'z-burger.mocked-sig',
      expect.objectContaining({ secure: false }),
    );
  });

  it('writes signed cookie on brand-create success path (defense-in-depth — CONTEXT D-03)', async () => {
    signActiveBrandMock.mockReturnValueOnce('z-burger.DETERMINISTIC');
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      data: { id: 'brand-uuid', slug: 'z-burger', displayName: 'Z Burger' },
      raw: new Response(),
    });
    await expect(createBrandAction({ error: null }, buildForm())).rejects.toThrow('REDIRECT');
    expect(signActiveBrandMock).toHaveBeenCalledWith('z-burger');
    expect(cookiesSetMock).toHaveBeenCalledWith(
      'resto.active_brand',
      'z-burger.DETERMINISTIC',
      expect.any(Object),
    );
  });
});
