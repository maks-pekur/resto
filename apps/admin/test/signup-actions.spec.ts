import { describe, expect, it, vi, beforeEach } from 'vitest';

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-server', () => ({ apiFetch: apiFetchMock }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT');
  }),
}));

const { signUpAction } = await import('../app/(auth)/signup/actions');

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

  it('forwards request and redirects on 201 without setting an active brand cookie', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        tenant: { id: 'tenant-uuid', slug: 'cafe-roma' },
        userId: 'user-uuid',
      },
      raw: new Response(),
    });
    await expect(signUpAction({ error: null }, buildForm())).rejects.toThrow('REDIRECT');
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/v1/signup',
      expect.objectContaining({ method: 'POST', forwardSetCookie: true }),
    );
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
  });
});
