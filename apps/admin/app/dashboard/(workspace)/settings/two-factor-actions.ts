'use server';

import { apiFetch } from '@/lib/api-server';

/**
 * AUTH-07 (D-22) — server actions for the 2FA TOTP enable / verify / disable flow.
 *
 * Contract per Better Auth 1.4.22 two-factor plugin
 * (node_modules/better-auth/dist/plugins/two-factor/index.d.mts):
 *
 *   POST /api/auth/two-factor/enable
 *     body  { password: string, issuer?: string }
 *     200   { totpURI: string, backupCodes: string[] }   (10 codes by default)
 *
 *   POST /api/auth/two-factor/verify-totp
 *     body  { code: string, trustDevice?: boolean }
 *     200   { token, user: UserWithTwoFactor }           (flips user.twoFactorEnabled=true)
 *
 *   POST /api/auth/two-factor/disable
 *     body  { password: string }
 *     200   { status: boolean }
 *
 * D-23: NO admin-reset-for-subordinates endpoint here (Phase 17 / TEAM-04).
 * D-23: NO email-recovery loop here (cancels the 2FA security gain).
 * D-23: NO recovery-code regeneration endpoint here (Phase 17 / TEAM-05).
 *
 * Pitfall 7: BA `skipVerificationOnEnable` default is `false`. `enable` only
 * generates the TOTP secret + backup codes; `user.twoFactorEnabled` flips to
 * `true` only after `verify-totp` succeeds. Closing the tab between enable
 * and verify leaves the user in the pre-2FA state — no lockout, no half-state.
 */

const TOTP_CODE_PATTERN = /^\d{6}$/u;

export type EnableTwoFactorError = 'invalid_password' | 'session_expired' | 'unknown';

export interface EnableTwoFactorOk {
  readonly ok: true;
  readonly totpURI: string;
  readonly backupCodes: readonly string[];
}

export interface EnableTwoFactorFail {
  readonly ok: false;
  readonly error: EnableTwoFactorError;
}

export type EnableTwoFactorResult = EnableTwoFactorOk | EnableTwoFactorFail;

interface EnableResponseBody {
  totpURI?: unknown;
  backupCodes?: unknown;
}

// WR-08: BA default is 10 backup codes; a future config change could
// shrink this. Require at least 1 non-empty code so a misconfigured shrink
// to e.g. 8 does not silently fail every enable. The UI itself prints
// whatever count BA returns.
const MIN_BACKUP_CODES = 1;

const isValidEnableResponse = (
  body: EnableResponseBody | null,
): body is { totpURI: string; backupCodes: string[] } => {
  if (!body) return false;
  if (typeof body.totpURI !== 'string' || body.totpURI.length === 0) return false;
  if (!Array.isArray(body.backupCodes)) return false;
  if (body.backupCodes.length < MIN_BACKUP_CODES) return false;
  return body.backupCodes.every((c) => typeof c === 'string' && c.length > 0);
};

export async function enableTwoFactorAction(password: string): Promise<EnableTwoFactorResult> {
  // Defense-in-depth: BA also rejects empty passwords; this avoids the
  // round-trip and gives a friendlier surface for the password dialog.
  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, error: 'invalid_password' };
  }

  const res = await apiFetch<EnableResponseBody>('/api/auth/two-factor/enable', {
    method: 'POST',
    body: { password },
    // BA may issue a transient 2FA-flow cookie on enable; forward upstream
    // Set-Cookie via the AUTH-08-canonical setForwardedCookie helper.
    forwardSetCookie: true,
  });

  if (!res.ok) {
    if (res.status === 401) return { ok: false, error: 'invalid_password' };
    if (res.status === 403) return { ok: false, error: 'session_expired' };
    return { ok: false, error: 'unknown' };
  }

  if (!isValidEnableResponse(res.data)) {
    return { ok: false, error: 'unknown' };
  }

  return { ok: true, totpURI: res.data.totpURI, backupCodes: res.data.backupCodes };
}

export type VerifyTwoFactorError = 'invalid_code' | 'session_expired' | 'unknown';

export interface VerifyTwoFactorOk {
  readonly ok: true;
}

export interface VerifyTwoFactorFail {
  readonly ok: false;
  readonly error: VerifyTwoFactorError;
}

export type VerifyTwoFactorResult = VerifyTwoFactorOk | VerifyTwoFactorFail;

export async function verifyTwoFactorAction(code: string): Promise<VerifyTwoFactorResult> {
  // Defense-in-depth: client also blocks the Confirm button until the input
  // matches /^\d{6}$/. Mirroring the check server-side avoids a wasted BA
  // round-trip and gives a deterministic error for non-numeric input.
  if (typeof code !== 'string' || !TOTP_CODE_PATTERN.test(code)) {
    return { ok: false, error: 'invalid_code' };
  }

  const res = await apiFetch<unknown>('/api/auth/two-factor/verify-totp', {
    method: 'POST',
    body: { code },
    // BA mints the post-verify session token via Set-Cookie; must be forwarded
    // so the next page load sees the upgraded session.
    forwardSetCookie: true,
  });

  if (!res.ok) {
    if (res.status >= 400 && res.status < 500) return { ok: false, error: 'invalid_code' };
    return { ok: false, error: 'unknown' };
  }
  return { ok: true };
}

export type DisableTwoFactorError = 'invalid_password' | 'session_expired' | 'unknown';

export interface DisableTwoFactorOk {
  readonly ok: true;
}

export interface DisableTwoFactorFail {
  readonly ok: false;
  readonly error: DisableTwoFactorError;
}

export type DisableTwoFactorResult = DisableTwoFactorOk | DisableTwoFactorFail;

export async function disableTwoFactorAction(password: string): Promise<DisableTwoFactorResult> {
  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, error: 'invalid_password' };
  }

  const res = await apiFetch<{ status?: boolean }>('/api/auth/two-factor/disable', {
    method: 'POST',
    body: { password },
    forwardSetCookie: true,
  });

  if (!res.ok) {
    if (res.status === 401) return { ok: false, error: 'invalid_password' };
    if (res.status === 403) return { ok: false, error: 'session_expired' };
    return { ok: false, error: 'unknown' };
  }
  return { ok: true };
}
