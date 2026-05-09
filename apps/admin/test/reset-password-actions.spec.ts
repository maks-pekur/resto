import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-server', () => ({ apiFetch: apiFetchMock }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT');
  }),
}));

const { resetPasswordAction } = await import('../app/reset-password/actions');

const buildForm = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set('token', 'valid-token');
  fd.set('newPassword', 'a-strong-password-12');
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
};

describe('resetPasswordAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty token without hitting the api', async () => {
    const result = await resetPasswordAction({ error: null }, buildForm({ token: '' }));
    expect(result.error).toMatch(/missing/i);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('rejects short passwords without hitting the api', async () => {
    const result = await resetPasswordAction({ error: null }, buildForm({ newPassword: 'short' }));
    expect(result.error).toMatch(/at least 12/);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('redirects to /login?reset=success on api 200', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, status: 200, data: {}, raw: new Response() });
    await expect(resetPasswordAction({ error: null }, buildForm())).rejects.toThrow('REDIRECT');
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/auth/reset-password',
      expect.objectContaining({
        method: 'POST',
        body: { token: 'valid-token', newPassword: 'a-strong-password-12' },
      }),
    );
  });

  it('surfaces invalid-token error from BA', async () => {
    apiFetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      data: { message: 'INVALID_TOKEN' },
      raw: new Response(),
    });
    const result = await resetPasswordAction({ error: null }, buildForm());
    expect(result.error).toMatch(/invalid or has expired/i);
  });

  it('surfaces 500 with generic message', async () => {
    apiFetchMock.mockResolvedValue({ ok: false, status: 500, data: null, raw: new Response() });
    const result = await resetPasswordAction({ error: null }, buildForm());
    expect(result.error).toMatch(/Something went wrong/);
  });
});
