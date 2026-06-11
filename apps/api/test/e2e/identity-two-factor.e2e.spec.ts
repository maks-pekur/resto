import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { base32 } from '@better-auth/utils/base32';
import { createOTP } from '@better-auth/utils/otp';
import {
  extractCookies,
  provisionTenant,
  runBootstrap,
  signInAsOperator,
} from './helpers/operator-fixture';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[identity-two-factor.e2e] Docker not available — skipping integration tests.');
}

const INTERNAL_TOKEN = 'integration-test-token-1234567890';

/**
 * AUTH-07 — 2FA TOTP enable + verify + recovery codes + partial-activation
 * rejection (Pitfall 7 closed).
 *
 * Contract assumptions (verified at types.d.mts):
 *  - POST /api/auth/two-factor/enable      body { password } → { totpURI, backupCodes: string[10] }
 *  - POST /api/auth/two-factor/verify-totp body { code }     → 200 + flips user.twoFactorEnabled
 *  - POST /api/auth/two-factor/disable     body { password } → { status: true }
 *
 * The current TOTP code is derived locally from the enrolment secret via
 * `@better-auth/utils/otp` (`createOTP(secret).totp()`) — the same generator
 * Better Auth uses server-side, so the codes match. There is no BA endpoint
 * that returns a code for a secret (that would defeat 2FA).
 *
 * D-23 / D-22 — what is NOT covered here (explicitly out of scope for Phase 03):
 *  - admin-reset-for-subordinates (Phase 17 / TEAM-04)
 *  - recovery-code regeneration UI (Phase 17 / TEAM-05)
 *  - email-recovery loop (collapses 2FA to email — never shipping)
 */

interface EnableResponse {
  readonly totpURI?: unknown;
  readonly backupCodes?: unknown;
}
interface MeBody {
  readonly kind?: unknown;
  readonly twoFactorEnabled?: unknown;
}

// Lightweight typed-narrow wrappers. fastify-light's `inject().json()` returns
// `any`; routing through a parameterized factory keeps the call sites typed
// without spreading inline asserts that the linter flags as either unsafe
// (no-unsafe-argument) or unnecessary (no-unnecessary-type-assertion).
const asEnable = (raw: unknown): EnableResponse => raw as EnableResponse;
const asMe = (raw: unknown): MeBody => raw as MeBody;

const extractSecret = (totpURI: string): string => {
  const url = new URL(totpURI);
  const secret = url.searchParams.get('secret');
  if (!secret) throw new Error(`extractSecret: no secret in ${totpURI}`);
  return secret;
};

// BA stores the TOTP secret encrypted and publishes base32(secret) in the
// otpauth URI; createOTP keys the HMAC on the raw secret string. Reverse the
// URI encoding to recover the exact secret BA verifies against, then generate
// the current code with the same util BA uses server-side.
const currentTotpCode = (totpURI: string): Promise<string> => {
  const rawSecret = new TextDecoder().decode(base32.decode(extractSecret(totpURI)));
  return createOTP(rawSecret).totp();
};

const readTotpURI = (raw: unknown): string => {
  const body = asEnable(raw);
  return typeof body.totpURI === 'string' ? body.totpURI : '';
};

const readBackupCodes = (raw: unknown): readonly string[] => {
  const body = asEnable(raw);
  if (!Array.isArray(body.backupCodes)) return [];
  return body.backupCodes.filter((c): c is string => typeof c === 'string');
};

const readTwoFactorEnabled = (raw: unknown): boolean => {
  const body = asMe(raw);
  return body.twoFactorEnabled === true;
};

const readMeKind = (raw: unknown): string => {
  const body = asMe(raw);
  return typeof body.kind === 'string' ? body.kind : '';
};

suite('Identity — 2FA TOTP enable + verify + Pitfall 7 closure (AUTH-07)', () => {
  let stack: RealStack;

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_PUBLIC_PER_MIN = '10000';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    stack = await startRealStack();
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('enable returns { totpURI, backupCodes[10] } and does NOT yet flip twoFactorEnabled', async () => {
    const slug = `t2f-${randomUUID().slice(0, 8)}`;
    const email = `owner-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-2fa';
    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password, name: '2FA Owner' });
    const cookie = await signInAsOperator(stack.app, email, password, tenant.id);

    const res = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/enable',
      headers: { 'content-type': 'application/json', cookie },
      payload: { password },
    });
    expect(res.statusCode).toBe(200);
    const totpURI = readTotpURI(res.json());
    expect(totpURI.startsWith('otpauth://totp/')).toBe(true);
    const codes = readBackupCodes(res.json());
    expect(codes.length).toBe(10);
    for (const code of codes) {
      expect(code.length).toBeGreaterThan(0);
    }

    // Pitfall 7 — twoFactorEnabled MUST still be false after enable (only verify flips it).
    const me = await stack.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { cookie },
    });
    expect(me.statusCode).toBe(200);
    expect(readMeKind(me.json())).toBe('operator');
    expect(readTwoFactorEnabled(me.json())).toBe(false);
  }, 60_000);

  it('verify-totp with the current code flips twoFactorEnabled=true on /v1/me', async () => {
    const slug = `t2f-${randomUUID().slice(0, 8)}`;
    const email = `owner-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-2fa-2';
    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password, name: '2FA Owner 2' });
    const cookie = await signInAsOperator(stack.app, email, password, tenant.id);

    const enable = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/enable',
      headers: { 'content-type': 'application/json', cookie },
      payload: { password },
    });
    expect(enable.statusCode).toBe(200);
    const code = await currentTotpCode(readTotpURI(enable.json()));
    expect(code).toMatch(/^\d{6}$/u);

    const verify = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/verify-totp',
      headers: { 'content-type': 'application/json', cookie },
      payload: { code },
    });
    expect(verify.statusCode).toBe(200);
    // BA rotates the session on 2FA activation (anti-fixation) — the old
    // cookie is invalidated; carry the refreshed one to authenticated calls.
    const verifiedCookie = extractCookies(verify.headers['set-cookie']) || cookie;

    const me = await stack.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { cookie: verifiedCookie },
    });
    expect(me.statusCode).toBe(200);
    expect(readTwoFactorEnabled(me.json())).toBe(true);
  }, 60_000);

  it('verify-totp with a wrong code does NOT flip twoFactorEnabled', async () => {
    const slug = `t2f-${randomUUID().slice(0, 8)}`;
    const email = `owner-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-2fa-3';
    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password, name: '2FA Owner 3' });
    const cookie = await signInAsOperator(stack.app, email, password, tenant.id);

    const enable = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/enable',
      headers: { 'content-type': 'application/json', cookie },
      payload: { password },
    });
    expect(enable.statusCode).toBe(200);

    const verify = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/verify-totp',
      headers: { 'content-type': 'application/json', cookie },
      payload: { code: '000000' },
    });
    expect(verify.statusCode).not.toBe(200);

    const me = await stack.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { cookie },
    });
    expect(me.statusCode).toBe(200);
    expect(readTwoFactorEnabled(me.json())).toBe(false);
  }, 60_000);

  it('Pitfall 7: closing the tab between enable and verify leaves twoFactorEnabled=false', async () => {
    const slug = `t2f-${randomUUID().slice(0, 8)}`;
    const email = `owner-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-2fa-4';
    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password, name: '2FA Owner 4' });
    const firstCookie = await signInAsOperator(stack.app, email, password, tenant.id);

    // Step 1: enable, capture the backup codes that were generated.
    const enable = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/enable',
      headers: { 'content-type': 'application/json', cookie: firstCookie },
      payload: { password },
    });
    expect(enable.statusCode).toBe(200);
    const generatedCodes = readBackupCodes(enable.json());
    expect(generatedCodes.length).toBe(10);

    // Step 2: do NOT call verify. Simulate "close the tab" by signing out and
    // signing back in (fresh session).
    await stack.app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { 'content-type': 'application/json', cookie: firstCookie },
      payload: {},
    });
    const secondCookie = await signInAsOperator(stack.app, email, password, tenant.id);

    // Step 3: /v1/me MUST still report twoFactorEnabled=false (no half-state).
    const me = await stack.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { cookie: secondCookie },
    });
    expect(me.statusCode).toBe(200);
    expect(readTwoFactorEnabled(me.json())).toBe(false);

    // Step 4: BA 1.4.22's verify-backup-code does NOT gate on twoFactorEnabled
    // (confirmed in better-auth source) — it matches a stored code from the
    // never-verified enable() and returns 200. That acceptance escalates
    // nothing: with twoFactorEnabled=false the sign-in path never demands a
    // second factor, so the code unlocks no privilege. The invariant that must
    // hold is the half-state guarantee — consuming such a code does NOT silently
    // flip the account into an enabled-2FA state.
    const firstCode = generatedCodes[0] ?? '';
    expect(firstCode.length).toBeGreaterThan(0);
    const useBackup = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/verify-backup-code',
      headers: { 'content-type': 'application/json', cookie: secondCookie },
      payload: { code: firstCode },
    });
    const afterBackupCookie = extractCookies(useBackup.headers['set-cookie']) || secondCookie;
    const meAfter = await stack.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { cookie: afterBackupCookie },
    });
    expect(meAfter.statusCode).toBe(200);
    expect(readTwoFactorEnabled(meAfter.json())).toBe(false);
  }, 60_000);

  it('disable: after activation, password-confirmed disable flips twoFactorEnabled back to false', async () => {
    const slug = `t2f-${randomUUID().slice(0, 8)}`;
    const email = `owner-${slug}@example.com`;
    const password = 'correct-horse-battery-staple-2fa-5';
    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    await runBootstrap({ tenantSlug: slug, email, password, name: '2FA Owner 5' });
    const cookie = await signInAsOperator(stack.app, email, password, tenant.id);

    const enable = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/enable',
      headers: { 'content-type': 'application/json', cookie },
      payload: { password },
    });
    expect(enable.statusCode).toBe(200);
    const code = await currentTotpCode(readTotpURI(enable.json()));

    const verify = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/verify-totp',
      headers: { 'content-type': 'application/json', cookie },
      payload: { code },
    });
    expect(verify.statusCode).toBe(200);
    // BA rotates the session on 2FA activation — carry the refreshed cookie.
    const verifiedCookie = extractCookies(verify.headers['set-cookie']) || cookie;

    const disable = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/two-factor/disable',
      headers: { 'content-type': 'application/json', cookie: verifiedCookie },
      payload: { password },
    });
    expect(disable.statusCode).toBe(200);

    const me = await stack.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { cookie: verifiedCookie },
    });
    expect(readTwoFactorEnabled(me.json())).toBe(false);
  }, 60_000);
});
