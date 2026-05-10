import { describe, expect, it, vi, beforeEach } from 'vitest';

const apiFetchMock = vi.fn();
const cookiesSetMock = vi.fn();
vi.mock('@/lib/api-server', () => ({ apiFetch: apiFetchMock }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ set: cookiesSetMock })),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT');
  }),
}));

const { signUpAction } = await import('../app/signup/actions');

describe('signUpAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const buildForm = (over: Record<string, string> = {}) => {
    const fd = new FormData();
    fd.set('email', 'owner@example.com');
    fd.set('password', 'a-strong-password-12');
    fd.set('displayName', 'Cafe Roma');
    fd.set('defaultCurrency', 'USD');
    for (const [k, v] of Object.entries(over)) fd.set(k, v);
    return fd;
  };

  it('returns validation error for short password', async () => {
    const result = await signUpAction({ error: null }, buildForm({ password: 'short' }));
    expect(result.error).toMatch(/at least 12/);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('forwards request, sets active-brand cookie, and redirects on 201', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        tenant: { id: 'tenant-uuid', slug: 'cafe-roma' },
        brand: { id: 'brand-uuid', slug: 'cafe-roma' },
        userId: 'user-uuid',
      },
      raw: new Response(),
    });
    await expect(signUpAction({ error: null }, buildForm())).rejects.toThrow('REDIRECT');
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/v1/signup',
      expect.objectContaining({ method: 'POST', forwardSetCookie: true }),
    );
    expect(cookiesSetMock).toHaveBeenCalledWith('resto.active_brand', 'cafe-roma', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  });

  it('surfaces email-taken friendly message', async () => {
    apiFetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      data: { code: 'signup.email_taken', message: 'taken' },
      raw: new Response(),
    });
    const result = await signUpAction({ error: null }, buildForm());
    expect(result.error).toMatch(/already exists/);
    expect(cookiesSetMock).not.toHaveBeenCalled();
  });

  it('surfaces 500 with generic message', async () => {
    apiFetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      data: { code: 'signup.auth_failed' },
      raw: new Response(),
    });
    const result = await signUpAction({ error: null }, buildForm());
    expect(result.error).toMatch(/Something went wrong/);
    expect(cookiesSetMock).not.toHaveBeenCalled();
  });
});
