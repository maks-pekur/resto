import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const apiFetchMock = vi.fn();
vi.mock('@/lib/api-server', () => ({ apiFetch: apiFetchMock }));

const { enableTwoFactorAction, verifyTwoFactorAction, disableTwoFactorAction } =
  await import('../app/dashboard/(workspace)/settings/two-factor-actions');

describe('two-factor-actions.enableTwoFactorAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls BA /api/auth/two-factor/enable with the password body and returns totpURI + backupCodes', async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        totpURI: 'otpauth://totp/RestOS:o@x?secret=ABCDEFGH&issuer=RestOS',
        backupCodes: [
          'aaaa-aaaa',
          'bbbb-bbbb',
          'cccc-cccc',
          'dddd-dddd',
          'eeee-eeee',
          'ffff-ffff',
          'gggg-gggg',
          'hhhh-hhhh',
          'iiii-iiii',
          'jjjj-jjjj',
        ],
      },
      raw: new Response(),
    });
    const result = await enableTwoFactorAction('current-password');
    expect(apiFetchMock).toHaveBeenCalledWith('/api/auth/two-factor/enable', {
      method: 'POST',
      body: { password: 'current-password' },
      forwardSetCookie: true,
    });
    expect(result).toEqual({
      ok: true,
      totpURI: 'otpauth://totp/RestOS:o@x?secret=ABCDEFGH&issuer=RestOS',
      backupCodes: [
        'aaaa-aaaa',
        'bbbb-bbbb',
        'cccc-cccc',
        'dddd-dddd',
        'eeee-eeee',
        'ffff-ffff',
        'gggg-gggg',
        'hhhh-hhhh',
        'iiii-iiii',
        'jjjj-jjjj',
      ],
    });
  });

  it('returns invalid_password on a 401 from BA (the password is wrong)', async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      data: { detail: 'Invalid password' },
      raw: new Response(),
    });
    const result = await enableTwoFactorAction('wrong-password');
    expect(result).toEqual({ ok: false, error: 'invalid_password' });
  });

  it('returns session_expired on a 403 from BA (no live session)', async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      data: { detail: 'No session' },
      raw: new Response(),
    });
    const result = await enableTwoFactorAction('any-password');
    expect(result).toEqual({ ok: false, error: 'session_expired' });
  });

  it('returns unknown on a generic 500 from BA', async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      data: null,
      raw: new Response(),
    });
    const result = await enableTwoFactorAction('any-password');
    expect(result).toEqual({ ok: false, error: 'unknown' });
  });

  it('rejects an empty password without calling BA', async () => {
    const result = await enableTwoFactorAction('');
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: 'invalid_password' });
  });

  it('rejects a malformed BA response (missing totpURI) as unknown', async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { backupCodes: ['only-one-code'] },
      raw: new Response(),
    });
    const result = await enableTwoFactorAction('current-password');
    expect(result).toEqual({ ok: false, error: 'unknown' });
  });

  it('rejects a malformed BA response (zero backup codes) as unknown', async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { totpURI: 'otpauth://x', backupCodes: [] },
      raw: new Response(),
    });
    const result = await enableTwoFactorAction('current-password');
    expect(result).toEqual({ ok: false, error: 'unknown' });
  });
});

describe('two-factor-actions.verifyTwoFactorAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls BA /api/auth/two-factor/verify-totp with the code body and returns ok on success', async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { token: 'session-token', user: { id: 'u1', twoFactorEnabled: true } },
      raw: new Response(),
    });
    const result = await verifyTwoFactorAction('123456');
    expect(apiFetchMock).toHaveBeenCalledWith('/api/auth/two-factor/verify-totp', {
      method: 'POST',
      body: { code: '123456' },
      forwardSetCookie: true,
    });
    expect(result).toEqual({ ok: true });
  });

  it('returns invalid_code when BA rejects the TOTP code as INVALID_CODE', async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      data: { code: 'INVALID_CODE', detail: 'Invalid code' },
      raw: new Response(),
    });
    const result = await verifyTwoFactorAction('000000');
    expect(result).toEqual({ ok: false, error: 'invalid_code' });
  });

  it('returns invalid_code on any 4xx (BA may surface variants of the same failure)', async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      data: { detail: 'unauthorized' },
      raw: new Response(),
    });
    const result = await verifyTwoFactorAction('000000');
    expect(result).toEqual({ ok: false, error: 'invalid_code' });
  });

  it('returns unknown on 5xx', async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      data: null,
      raw: new Response(),
    });
    const result = await verifyTwoFactorAction('123456');
    expect(result).toEqual({ ok: false, error: 'unknown' });
  });

  it('rejects a non-6-digit code without calling BA (defense-in-depth — client also blocks)', async () => {
    const r1 = await verifyTwoFactorAction('12345');
    const r2 = await verifyTwoFactorAction('1234567');
    const r3 = await verifyTwoFactorAction('abcdef');
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(r1).toEqual({ ok: false, error: 'invalid_code' });
    expect(r2).toEqual({ ok: false, error: 'invalid_code' });
    expect(r3).toEqual({ ok: false, error: 'invalid_code' });
  });
});

describe('two-factor-actions.disableTwoFactorAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls BA /api/auth/two-factor/disable with the password body', async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { status: true },
      raw: new Response(),
    });
    const result = await disableTwoFactorAction('current-password');
    expect(apiFetchMock).toHaveBeenCalledWith('/api/auth/two-factor/disable', {
      method: 'POST',
      body: { password: 'current-password' },
      forwardSetCookie: true,
    });
    expect(result).toEqual({ ok: true });
  });

  it('returns invalid_password on a 401 from BA', async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      data: { detail: 'Invalid password' },
      raw: new Response(),
    });
    const result = await disableTwoFactorAction('wrong-password');
    expect(result).toEqual({ ok: false, error: 'invalid_password' });
  });
});
