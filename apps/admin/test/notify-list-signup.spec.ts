import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const apiFetchMock = vi.fn();
const consoleWarnMock = vi.fn();

vi.mock('@/lib/api-server', () => ({ apiFetch: apiFetchMock }));

const { notifyListSignupAction, __resetNotifyListThrottleForTests } =
  await import('../lib/actions/notify-list-signup');

const buildForm = (over: Record<string, string> = {}): FormData => {
  const fd = new FormData();
  fd.set('email', 'owner@example.com');
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
};

describe('notifyListSignupAction', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    consoleWarnMock.mockReset();
    __resetNotifyListThrottleForTests();
    vi.spyOn(console, 'warn').mockImplementation(consoleWarnMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects an invalid email shape without calling apiFetch', async () => {
    const result = await notifyListSignupAction(
      { ok: false, error: null },
      buildForm({ email: 'not-an-email' }),
    );
    expect(result).toEqual({ ok: false, error: 'Please enter a valid email.' });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('rejects when email is missing entirely', async () => {
    const fd = new FormData();
    const result = await notifyListSignupAction({ ok: false, error: null }, fd);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/valid email/iu);
  });

  it('returns ok on a 200 success response from the api', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ok: true },
      raw: new Response(),
    });
    const result = await notifyListSignupAction({ ok: false, error: null }, buildForm());
    expect(result).toEqual({ ok: true, error: null });
    expect(apiFetchMock).toHaveBeenCalledWith('/v1/marketing/notify-list', {
      method: 'POST',
      body: { email: 'owner@example.com' },
    });
  });

  it('returns ok on 202 accepted', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, status: 202, data: null, raw: new Response() });
    const result = await notifyListSignupAction({ ok: false, error: null }, buildForm());
    expect(result).toEqual({ ok: true, error: null });
  });

  it('on 404 degraded path: returns ok and logs the email via console.warn (CONTEXT D-17)', async () => {
    apiFetchMock.mockResolvedValue({ ok: false, status: 404, data: null, raw: new Response() });
    const result = await notifyListSignupAction({ ok: false, error: null }, buildForm());
    expect(result).toEqual({ ok: true, error: null });
    expect(consoleWarnMock).toHaveBeenCalledTimes(1);
    expect(consoleWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: expect.stringMatching(/ai_notify_list_signup/u) as unknown,
        email: 'owner@example.com',
      }),
    );
  });

  it('on 4xx other returns the friendly client-side error message', async () => {
    apiFetchMock.mockResolvedValue({ ok: false, status: 422, data: null, raw: new Response() });
    const result = await notifyListSignupAction({ ok: false, error: null }, buildForm());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/could not add you to the list/iu);
  });

  it('on 5xx returns a generic try-again error', async () => {
    apiFetchMock.mockResolvedValue({ ok: false, status: 500, data: null, raw: new Response() });
    const result = await notifyListSignupAction({ ok: false, error: null }, buildForm());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Something went wrong/iu);
  });

  it('in-process throttle: 6 distinct emails on the 404 path log only 5 times (F-7)', async () => {
    apiFetchMock.mockResolvedValue({ ok: false, status: 404, data: null, raw: new Response() });
    const emails = ['a@x.test', 'b@x.test', 'c@x.test', 'd@x.test', 'e@x.test', 'f@x.test'];
    for (const email of emails) {
      const result = await notifyListSignupAction({ ok: false, error: null }, buildForm({ email }));
      expect(result).toEqual({ ok: true, error: null });
    }
    // The 6th distinct email in the 60s window is throttled; only the first
    // 5 produce a log entry. The user-facing response is still ok for all 6.
    expect(consoleWarnMock).toHaveBeenCalledTimes(5);
  });

  it('throttle does NOT silently drop repeat submissions of an already-seen email', async () => {
    apiFetchMock.mockResolvedValue({ ok: false, status: 404, data: null, raw: new Response() });
    await notifyListSignupAction({ ok: false, error: null }, buildForm({ email: 'a@x.test' }));
    await notifyListSignupAction({ ok: false, error: null }, buildForm({ email: 'b@x.test' }));
    await notifyListSignupAction({ ok: false, error: null }, buildForm({ email: 'c@x.test' }));
    await notifyListSignupAction({ ok: false, error: null }, buildForm({ email: 'd@x.test' }));
    await notifyListSignupAction({ ok: false, error: null }, buildForm({ email: 'e@x.test' }));
    // Cap reached. A 6th distinct email is dropped...
    await notifyListSignupAction({ ok: false, error: null }, buildForm({ email: 'f@x.test' }));
    // ...but a repeat of an already-seen email still logs (the throttle key
    // is "distinct emails over the window", not "any submission").
    await notifyListSignupAction({ ok: false, error: null }, buildForm({ email: 'a@x.test' }));
    // 5 distinct + 1 repeat = 6 log entries; the f@x.test one is dropped.
    expect(consoleWarnMock).toHaveBeenCalledTimes(6);
  });
});
