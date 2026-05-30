import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-server', () => ({ apiFetch: apiFetchMock }));

const adminOriginMock = vi.fn(() => 'https://admin.example.test');
vi.mock('@/lib/env', () => ({ adminOrigin: adminOriginMock }));

const { forgotPasswordAction } = await import('../app/(auth)/forgot-password/actions');

const buildForm = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set('email', 'owner@example.com');
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
};

describe('forgotPasswordAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid emails without hitting the api', async () => {
    const result = await forgotPasswordAction(
      { error: null, submitted: false },
      buildForm({ email: 'nope' }),
    );
    expect(result.error).toMatch(/valid email/i);
    expect(result.submitted).toBe(false);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('returns submitted=true on api 200', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, status: 200, data: {}, raw: new Response() });
    const result = await forgotPasswordAction({ error: null, submitted: false }, buildForm());
    expect(result).toEqual({ error: null, submitted: true });
  });

  it('still returns submitted=true on api 4xx (no account-enumeration leak)', async () => {
    apiFetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      data: { message: 'INVALID_EMAIL' },
      raw: new Response(),
    });
    const result = await forgotPasswordAction({ error: null, submitted: false }, buildForm());
    expect(result.submitted).toBe(true);
    expect(result.error).toBeNull();
  });

  it('surfaces 5xx as a user-facing error', async () => {
    apiFetchMock.mockResolvedValue({ ok: false, status: 500, data: null, raw: new Response() });
    const result = await forgotPasswordAction({ error: null, submitted: false }, buildForm());
    expect(result.submitted).toBe(false);
    expect(result.error).toMatch(/Something went wrong/);
  });

  it('passes adminOrigin-derived redirectTo to BA', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, status: 200, data: {}, raw: new Response() });
    await forgotPasswordAction({ error: null, submitted: false }, buildForm());
    expect(apiFetchMock).toHaveBeenCalledWith('/api/auth/request-password-reset', {
      method: 'POST',
      body: {
        email: 'owner@example.com',
        redirectTo: 'https://admin.example.test/reset-password',
      },
    });
  });
});
